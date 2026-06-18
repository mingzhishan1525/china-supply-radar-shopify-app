# UX Copy Audit

## Current Copy Overview
### Page Subtitle
Current: "Shopify App V1 workspace for supplier lead times, reorder timing, and China holiday risk."
Problem: Too technical, looks like internal workspace, not a merchant-facing product
✘ Does not highlight core value proposition immediately

### Navigation Tabs
Current: ["Dashboard", "Products", "Suppliers", "Holiday Calendar", "Settings"]
Problem:
- "Products" is too generic, looks like standard inventory tool
- "Holiday Calendar" does not highlight the risk aspect
- Missing clear "Recommendations" and "Orders" sections
✘ 30-second value understanding: Low, merchant sees generic inventory terms

### Dashboard Metrics
Current labels:
- "Critical risk" / "High risk" / "Medium risk" / "Low risk"
- "Products requiring reorder"
- "Earliest stockout days"
Problem: Too generic, does not tie risk to China supply chain specifically
✘ Looks like standard inventory risk tool, not China-focused

### Dashboard Sections
Current headings:
- "Sales Velocity"
- "Recommendations"
- "China Holiday Impact"
- "Upcoming Stockout"
- "Reorder Queue"
Problem:
- "Sales Velocity" is technical term, merchants may not understand immediately
- "Upcoming Stockout" does not mention holiday factor

### Empty State Messages
Current:
- "Generate recommendations after syncing products, inventory, and orders."
- "No calculated stockout risk yet. Sync orders and map suppliers to calculate inventory cover days."
Problem: Too technical, does not highlight the value of completing these steps for China supply chain risk mitigation

## Copy Issues by Category
### C. Which copy looks like ordinary inventory tool
1. All generic "risk" labels without "China supply chain" or "China holiday" context
2. "Inventory cover days" without tying to holiday lead times
3. "Products" tab
4. "Sales Velocity" heading
5. Generic "stockout" warnings without China context

### D. Which copy should highlight
✅ **China Supplier Risk** - All supplier-related sections
✅ **Chinese Holiday Risk** - All risk warnings, holiday section
✅ **Factory Slowdown Alerts** - Dashboard metrics, recommendations
✅ **Lead Time Planning** - Supplier mapping, lead time fields
✅ **Reorder Timing** - Recommendations, reorder queue

## Final Replacement Copy
### Page Title & Subtitle
Title: China Supply Radar
Subtitle: Avoid stockouts from Chinese factory holidays. Optimize reorder timing based on real sales data and supplier lead times.

### Navigation Tabs (revised)
[
  { id: "overview", content: "Overview" },
  { id: "suppliers", content: "Suppliers" },
  { id: "orders", content: "Orders" },
  { id: "recommendations", content: "Recommendations" },
  { id: "holidays", content: "China Holiday Risk" },
  { id: "settings", content: "Settings" },
]

### Dashboard Metrics
Labels:
- "China supply chain critical risk"
- "China holiday high risk"
- "Factory slowdown medium risk"
- "Low risk"
- "Products needing reorder before next holiday"
- "Earliest stockout before holiday"

### Dashboard Section Headings
1. "Sales & Order Sync Status" (replace "Sales Velocity")
2. "China Holiday Risk Alerts" (replace "China Holiday Impact")
3. "Recommended Reorder Timing" (replace "Recommendations")
4. "Upcoming Stockouts Before Holiday" (replace "Upcoming Stockout")
5. "Reorder Queue for China Suppliers" (replace "Reorder Queue")

### Empty State Messages
#### Dashboard Empty (no orders synced)
Title: No China supply chain risk data yet
Description: Sync your Shopify orders and map products to Chinese suppliers to calculate holiday stockout risk and recommended reorder dates.
Primary Action: Sync Orders

#### Suppliers Empty
Title: No suppliers added yet
Description: Add your Chinese suppliers and their lead times to start tracking factory slowdown and holiday risks.
Primary Action: Add Supplier

#### Products/Supplier Mapping Empty
Title: No products mapped to suppliers yet
Description: Map your Shopify products to Chinese suppliers to calculate accurate lead times and holiday reorder recommendations.
Primary Action: Map Products

#### Recommendations Empty
Title: No reorder recommendations yet
Description: Sync orders and map suppliers to get personalized reorder timing recommendations based on upcoming Chinese factory holidays.
Primary Action: Sync Orders & Map Suppliers

#### Holiday Section Empty
Title: No upcoming China holidays
Description: We'll alert you when the next Chinese factory holiday is approaching so you can plan your orders ahead.

### Button Labels
- "Sync Shopify Inventory" → "Sync Products & Inventory"
- "Sync orders" → "Sync Order History"
- "Map Suppliers" → "Map to China Suppliers"
