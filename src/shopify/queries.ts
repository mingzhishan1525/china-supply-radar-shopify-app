export const PRODUCTS_QUERY = `#graphql
  query ProductsForInventoryRisk($first: Int! = 50) {
    products(first: $first) {
      nodes {
        id
        title
        variants(first: 100) {
          nodes {
            id
            title
            sku
            inventoryQuantity
          }
        }
      }
    }
  }
`;

export const PRODUCTS_FOR_SYNC_QUERY = `#graphql
  query ProductsForSync($first: Int! = 50, $variantsFirst: Int! = 50) {
    products(first: $first) {
      nodes {
        id
        title
        updatedAt
        variants(first: $variantsFirst) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
            updatedAt
          }
        }
      }
    }
  }
`;

export const INVENTORY_LEVELS_QUERY = `#graphql
  query InventoryLevels($inventoryItemId: ID!) {
    inventoryItem(id: $inventoryItemId) {
      id
      inventoryLevels(first: 20) {
        nodes {
          id
          available
          location {
            id
            name
          }
        }
      }
    }
  }
`;

export const ORDERS_FOR_SALES_VELOCITY_QUERY = `#graphql
  query OrdersForSalesVelocity($first: Int! = 100, $query: String!, $lineItemsFirst: Int! = 100) {
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        createdAt
        cancelledAt
        lineItems(first: $lineItemsFirst) {
          nodes {
            quantity
            variant {
              id
            }
            title
            name
          }
        }
      }
    }
  }
`;
