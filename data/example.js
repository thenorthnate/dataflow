// ============================================================================
// EXAMPLE DATASET — a fictional e-commerce system.
//
// This file is the template. To make your own diagram:
//
//     cp data/example.js data/local.js
//
// ...then replace the contents below. `data/local.js` is gitignored, so it
// survives every `git pull` and is never committed to this repo.
//
// See data/README.md for the full field reference.
//
// Note that this is a .js file rather than .json, which means comments and
// trailing commas are legal here — useful in a file this size. Everything
// inside the dataflow({ ... }) call is otherwise plain JSON.
// ============================================================================

dataflow({
  "id": "example",
  "label": "Example — E-commerce",
  "schema": 1,

  "nodeTypes": {
    "gateway":  { "color": "#2F5FD9" },
    "service":  { "color": "#4C82F7" },
    "broker":   { "color": "#E0A800" },
    "database": { "color": "#F79B4C" },
    "cache":    { "color": "#F76E8E" },
    "storage":  { "color": "#4CAF50" },
    "external": { "color": "#9AA0A6" }
  },

  "edgeTypes": {
    "rest":      { "color": "#4C82F7", "lineStyle": "solid",  "width": 2,   "arrow": "triangle" },
    "rabbitmq":  { "color": "#E0A800", "lineStyle": "dashed", "width": 2,   "arrow": "triangle" },
    "websocket": { "color": "#8E5CF7", "lineStyle": "dotted", "width": 2,   "arrow": "triangle" },
    "db":        { "color": "#C77A3B", "lineStyle": "solid",  "width": 1.5, "arrow": "triangle" },
    "cache":     { "color": "#F76E8E", "lineStyle": "dashed", "width": 1.5, "arrow": "triangle" },
    "file-io":   { "color": "#4CAF50", "lineStyle": "dashed", "width": 1.5, "arrow": "none" }
  },

  "tags": ["checkout", "fulfillment", "notifications"],

  "nodes": [
    // Group nodes: any node used as another node's "parent" becomes a
    // collapsible cluster. They have no "type" and no "position".
    { "id": "grp-frontend", "label": "Frontend",
      "details": { "description": "Client applications and the edge gateway they talk to." } },
    { "id": "grp-commerce", "label": "Commerce",
      "details": { "team": "Commerce", "description": "Order and inventory management." } },
    { "id": "grp-payments", "label": "Payments",
      "details": { "team": "Payments", "description": "Payment capture and reconciliation." } },
    { "id": "grp-platform", "label": "Platform Infra",
      "details": { "team": "Platform", "description": "Shared messaging, caching, and notification infrastructure." } },

    { "id": "web-app", "label": "Web App", "type": "service", "parent": "grp-frontend",
      "position": { "x": 60, "y": 60 }, "tags": ["checkout"],
      "details": { "description": "Customer-facing React SPA.", "repo": "github.com/org/web-app", "owner": "Frontend Guild" } },
    { "id": "mobile-app", "label": "Mobile App", "type": "service", "parent": "grp-frontend",
      "position": { "x": 60, "y": 200 }, "tags": ["checkout"],
      "details": { "description": "iOS/Android client.", "repo": "github.com/org/mobile-app", "owner": "Frontend Guild" } },
    { "id": "api-gateway", "label": "API Gateway", "type": "gateway", "parent": "grp-frontend",
      "position": { "x": 230, "y": 130 }, "tags": ["checkout", "fulfillment"],
      "details": { "description": "Public entry point; auth, rate limiting, routing.", "repo": "github.com/org/api-gateway", "owner": "Platform" } },

    { "id": "orders-service", "label": "Orders Service", "type": "service", "parent": "grp-commerce",
      "position": { "x": 440, "y": 60 }, "tags": ["checkout", "fulfillment"],
      "details": { "description": "Owns order lifecycle and publishes order events.", "repo": "github.com/org/orders-service", "owner": "Commerce" } },
    { "id": "inventory-service", "label": "Inventory Service", "type": "service", "parent": "grp-commerce",
      "position": { "x": 440, "y": 220 }, "tags": ["fulfillment"],
      "details": { "description": "Tracks stock levels per SKU/warehouse.", "repo": "github.com/org/inventory-service", "owner": "Commerce" } },
    { "id": "orders-db", "label": "Orders DB", "type": "database", "parent": "grp-commerce",
      "position": { "x": 600, "y": 60 }, "tags": ["checkout", "fulfillment"],
      "details": { "engine": "PostgreSQL", "description": "System of record for orders." } },
    { "id": "inventory-db", "label": "Inventory DB", "type": "database", "parent": "grp-commerce",
      "position": { "x": 600, "y": 220 }, "tags": ["fulfillment"],
      "details": { "engine": "PostgreSQL", "description": "System of record for stock levels." } },

    { "id": "payments-service", "label": "Payments Service", "type": "service", "parent": "grp-payments",
      "position": { "x": 800, "y": 60 }, "tags": ["checkout"],
      "details": { "description": "Captures payments and records ledger entries.", "repo": "github.com/org/payments-service", "owner": "Payments" } },
    { "id": "payments-db", "label": "Payments DB", "type": "database", "parent": "grp-payments",
      "position": { "x": 980, "y": 180 },
      "details": { "engine": "PostgreSQL", "description": "Ledger and transaction records." } },
    { "id": "payment-processor", "label": "Stripe", "type": "external",
      "position": { "x": 1180, "y": 60 }, "tags": ["checkout"],
      "details": { "description": "Third-party payment processor.", "docs": "stripe.com/docs" } },

    { "id": "message-bus", "label": "Message Bus", "type": "broker", "parent": "grp-platform",
      "position": { "x": 340, "y": 420 }, "tags": ["fulfillment", "notifications"],
      "details": { "engine": "RabbitMQ", "description": "Async event backbone for order/inventory events." } },
    { "id": "notifications-service", "label": "Notifications Service", "type": "service", "parent": "grp-platform",
      "position": { "x": 580, "y": 420 }, "tags": ["notifications"],
      "details": { "description": "Sends push/email notifications on domain events.", "repo": "github.com/org/notifications-service", "owner": "Platform" } },
    { "id": "websocket-gateway", "label": "Websocket Gateway", "type": "gateway", "parent": "grp-platform",
      "position": { "x": 820, "y": 460 }, "tags": ["notifications"],
      "details": { "description": "Fans out real-time updates to connected clients.", "repo": "github.com/org/ws-gateway", "owner": "Platform" } },
    { "id": "redis-cache", "label": "Redis Cache", "type": "cache", "parent": "grp-platform",
      "position": { "x": 340, "y": 550 },
      "details": { "engine": "Redis", "description": "Read-through cache for hot inventory lookups." } },
    { "id": "file-storage", "label": "S3 Bucket", "type": "storage", "parent": "grp-platform",
      "position": { "x": 580, "y": 550 }, "tags": ["fulfillment"],
      "details": { "engine": "S3", "description": "Durable storage for generated documents." } }
  ],

  "edges": [
    { "id": "e-web-gw",     "source": "web-app",             "target": "api-gateway",         "type": "rest",      "label": "HTTPS", "tags": ["checkout"],
      "details": { "payload": "Standard REST/JSON requests", "auth": "Bearer JWT" } },
    { "id": "e-mobile-gw", "source": "mobile-app",           "target": "api-gateway",          "type": "rest",      "label": "HTTPS", "tags": ["checkout"],
      "details": { "payload": "Standard REST/JSON requests", "auth": "Bearer JWT" } },
    { "id": "e-gw-orders", "source": "api-gateway",          "target": "orders-service",       "type": "rest",      "label": "/orders", "tags": ["checkout"],
      "details": { "methods": "GET, POST", "payload": "OrderRequest / OrderResponse" } },
    { "id": "e-gw-inv",    "source": "api-gateway",          "target": "inventory-service",    "type": "rest",      "label": "/inventory", "tags": ["fulfillment"],
      "details": { "methods": "GET", "payload": "StockLevel[]" } },
    { "id": "e-gw-pay",    "source": "api-gateway",          "target": "payments-service",     "type": "rest",      "label": "/payments", "tags": ["checkout"],
      "details": { "methods": "POST", "payload": "PaymentRequest" } },
    { "id": "e-gw-ws",     "source": "api-gateway",          "target": "websocket-gateway",    "type": "websocket", "label": "live status", "tags": ["notifications"],
      "details": { "description": "Upgrades HTTP connection to WS for live order status updates." } },

    { "id": "e-orders-db",     "source": "orders-service",     "target": "orders-db",        "type": "db", "label": "read/write", "tags": ["checkout", "fulfillment"],
      "details": { "notes": "Direct SQL access via connection pool." } },
    { "id": "e-inventory-db",  "source": "inventory-service",  "target": "inventory-db",     "type": "db", "label": "read/write", "tags": ["fulfillment"],
      "details": { "notes": "Direct SQL access via connection pool." } },
    { "id": "e-payments-db",   "source": "payments-service",   "target": "payments-db",      "type": "db", "label": "read/write", "tags": ["checkout"],
      "details": { "notes": "Direct SQL access via connection pool." } },
    { "id": "e-inventory-cache", "source": "inventory-service", "target": "redis-cache",     "type": "cache", "label": "read-through",
      "details": { "ttl": "60s", "notes": "Falls back to inventory-db on cache miss." } },

    { "id": "e-orders-bus",    "source": "orders-service",       "target": "message-bus",         "type": "rabbitmq", "label": "order.created", "tags": ["fulfillment"],
      "details": { "payload": "OrderCreatedEvent { orderId, userId, total }", "delivery": "at-least-once" } },
    { "id": "e-bus-inventory", "source": "message-bus",          "target": "inventory-service",   "type": "rabbitmq", "label": "order.created", "tags": ["fulfillment"],
      "details": { "queue": "inventory.order-created", "notes": "Decrements reserved stock." } },
    { "id": "e-bus-notify",    "source": "message-bus",          "target": "notifications-service","type": "rabbitmq", "label": "order.created", "tags": ["notifications"],
      "details": { "queue": "notifications.order-created", "notes": "Triggers order-confirmation email." } },

    { "id": "e-pay-stripe", "source": "payments-service", "target": "payment-processor", "type": "rest", "label": "charge", "tags": ["checkout"],
      "details": { "payload": "ChargeRequest { amount, currency, source }", "notes": "Synchronous call, retried with backoff on 5xx." } },
    { "id": "e-notify-ws",  "source": "notifications-service", "target": "websocket-gateway", "type": "websocket", "label": "push", "tags": ["notifications"],
      "details": { "description": "Pushes in-app notification payloads to the gateway for fan-out." } },
    { "id": "e-orders-invoice", "source": "orders-service", "target": "file-storage", "type": "file-io", "label": "invoice PDF", "tags": ["fulfillment"],
      "details": { "format": "PDF", "notes": "Written once per completed order; referenced by URL from Orders DB." } }
  ]
});
