using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.eShopWeb.ApplicationCore.Entities;
using Microsoft.eShopWeb.Infrastructure.Data;

namespace Microsoft.eShopWeb.PublicApi.Diagnostics;

public class K6CatalogStateService
{
    private const string EnableCatalogItemsIdentityInsertSql = "SET IDENTITY_INSERT [CatalogItems] ON;";
    private const string DisableCatalogItemsIdentityInsertSql = "SET IDENTITY_INSERT [CatalogItems] OFF;";
    private static readonly MethodInfo CatalogItemIdSetter = typeof(BaseEntity)
        .GetProperty(nameof(BaseEntity.Id))?
        .GetSetMethod(nonPublic: true)
        ?? throw new InvalidOperationException("Catalog item Id setter could not be located.");

    private readonly CatalogContext _catalogContext;

    public K6CatalogStateService(CatalogContext catalogContext)
    {
        _catalogContext = catalogContext;
    }

    public Task<K6CatalogStateResponse> PrepareAsync(K6CatalogStateRequest request, CancellationToken cancellationToken = default)
    {
        return ResetCatalogStateAsync(request, "prepare", cancellationToken);
    }

    public Task<K6CatalogStateResponse> CleanupAsync(K6CatalogStateRequest request, CancellationToken cancellationToken = default)
    {
        return ResetCatalogStateAsync(request, "cleanup", cancellationToken);
    }

    private async Task<K6CatalogStateResponse> ResetCatalogStateAsync(K6CatalogStateRequest request, string operation, CancellationToken cancellationToken)
    {
        var canonicalCatalogItemIds = CatalogContextSeed.CanonicalCatalogItems
            .Select(item => item.Id)
            .ToArray();

        var runTag = request.RunTag();
        var taggedItems = await _catalogContext.CatalogItems
            .Where(item => !canonicalCatalogItemIds.Contains(item.Id) &&
                           (item.Name.Contains(runTag) || item.Description.Contains(runTag)))
            .ToListAsync(cancellationToken);

        if (taggedItems.Count > 0)
        {
            _catalogContext.CatalogItems.RemoveRange(taggedItems);
        }

        var existingSeededItems = await _catalogContext.CatalogItems
            .Where(item => canonicalCatalogItemIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, cancellationToken);

        var missingSeededItems = new List<CatalogContextSeed.SeededCatalogItemSnapshot>();
        var restoredSeededItemCount = 0;

        foreach (var canonicalItem in CatalogContextSeed.CanonicalCatalogItems)
        {
            if (!existingSeededItems.TryGetValue(canonicalItem.Id, out var existingSeededItem))
            {
                missingSeededItems.Add(canonicalItem);
                continue;
            }

            if (RestoreCanonicalSeedValues(existingSeededItem, canonicalItem))
            {
                restoredSeededItemCount++;
            }
        }

        if (taggedItems.Count > 0 || restoredSeededItemCount > 0)
        {
            await _catalogContext.SaveChangesAsync(cancellationToken);
        }

        if (missingSeededItems.Count > 0)
        {
            await InsertMissingSeededItemsAsync(missingSeededItems, cancellationToken);
        }

        var catalogBrandIds = await _catalogContext.CatalogBrands
            .OrderBy(brand => brand.Id)
            .Select(brand => brand.Id)
            .ToArrayAsync(cancellationToken);

        var catalogTypeIds = await _catalogContext.CatalogTypes
            .OrderBy(type => type.Id)
            .Select(type => type.Id)
            .ToArrayAsync(cancellationToken);

        return new K6CatalogStateResponse(request.CorrelationId())
        {
            Operation = operation,
            RunId = request.RunId,
            RemovedRunTaggedCatalogItemCount = taggedItems.Count,
            RestoredSeededCatalogItemCount = restoredSeededItemCount,
            RecreatedSeededCatalogItemCount = missingSeededItems.Count,
            SeededCatalogItemIds = canonicalCatalogItemIds,
            CatalogBrandIds = catalogBrandIds,
            CatalogTypeIds = catalogTypeIds
        };
    }

    private bool RestoreCanonicalSeedValues(CatalogItem existingItem, CatalogContextSeed.SeededCatalogItemSnapshot canonicalItem)
    {
        var valuesChanged =
            existingItem.Name != canonicalItem.Name ||
            existingItem.Description != canonicalItem.Description ||
            existingItem.Price != canonicalItem.Price ||
            existingItem.CatalogBrandId != canonicalItem.CatalogBrandId ||
            existingItem.CatalogTypeId != canonicalItem.CatalogTypeId ||
            existingItem.PictureUri != canonicalItem.PictureUri;

        if (!valuesChanged)
        {
            return false;
        }

        existingItem.UpdateDetails(new CatalogItem.CatalogItemDetails(canonicalItem.Name, canonicalItem.Description, canonicalItem.Price));
        existingItem.UpdateBrand(canonicalItem.CatalogBrandId);
        existingItem.UpdateType(canonicalItem.CatalogTypeId);
        _catalogContext.Entry(existingItem).Property(item => item.PictureUri).CurrentValue = canonicalItem.PictureUri;

        return true;
    }

    private async Task InsertMissingSeededItemsAsync(
        IReadOnlyCollection<CatalogContextSeed.SeededCatalogItemSnapshot> missingSeededItems,
        CancellationToken cancellationToken)
    {
        if (missingSeededItems.Count == 0)
        {
            return;
        }

        if (_catalogContext.Database.IsSqlServer())
        {
            await InsertMissingSeededItemsForSqlServerAsync(missingSeededItems, cancellationToken);
            return;
        }

        foreach (var missingSeededItem in missingSeededItems.OrderBy(item => item.Id))
        {
            var catalogItem = missingSeededItem.ToEntity();
            CatalogItemIdSetter.Invoke(catalogItem, new object[] { missingSeededItem.Id });
            _catalogContext.CatalogItems.Add(catalogItem);
        }

        await _catalogContext.SaveChangesAsync(cancellationToken);
    }

    private async Task InsertMissingSeededItemsForSqlServerAsync(
        IReadOnlyCollection<CatalogContextSeed.SeededCatalogItemSnapshot> missingSeededItems,
        CancellationToken cancellationToken)
    {
        await using var transaction = await _catalogContext.Database.BeginTransactionAsync(cancellationToken);

        await _catalogContext.Database.ExecuteSqlRawAsync(EnableCatalogItemsIdentityInsertSql, cancellationToken);

        foreach (var missingSeededItem in missingSeededItems.OrderBy(item => item.Id))
        {
            await _catalogContext.Database.ExecuteSqlInterpolatedAsync(
                $@"INSERT INTO [CatalogItems] ([Id], [CatalogTypeId], [CatalogBrandId], [Description], [Name], [Price], [PictureUri])
                   VALUES ({missingSeededItem.Id}, {missingSeededItem.CatalogTypeId}, {missingSeededItem.CatalogBrandId}, {missingSeededItem.Description}, {missingSeededItem.Name}, {missingSeededItem.Price}, {missingSeededItem.PictureUri});",
                cancellationToken);
        }

        var maxCatalogItemId = await _catalogContext.CatalogItems.MaxAsync(item => item.Id, cancellationToken);
        await _catalogContext.Database.ExecuteSqlInterpolatedAsync(
            $"DBCC CHECKIDENT ('CatalogItems', RESEED, {maxCatalogItemId});",
            cancellationToken);
        await _catalogContext.Database.ExecuteSqlRawAsync(DisableCatalogItemsIdentityInsertSql, cancellationToken);

        await transaction.CommitAsync(cancellationToken);
    }
}
