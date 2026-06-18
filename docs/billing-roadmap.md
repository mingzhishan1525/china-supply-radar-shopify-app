# Internal Billing Roadmap

Status: PLANNED. Billing is not implemented and must not be represented as active in public Terms, listing copy, screenshots, or review instructions.

Current pricing: Free beta.

No charges are made through Shopify at this time.

Future paid plans may be introduced later with advance notice.

## Pricing Structure
PLANNED internal draft only. Do not publish as current pricing.

### Tier 1: Starter - $9.9/month
**Included features:**
- Up to 50 products
- Basic inventory cover days calculation
- Chinese holiday alert notifications
- Email support
- 14-day free trial

**Paywall limits:**
- Only 50 products synced
- No recommendations or supplier mapping

### Tier 2: Growth - $29.9/month (recommended for most merchants)
**Included features:**
- Up to 500 products
- All Starter features
- Smart reorder recommendations
- Supplier lead time tracking
- Priority email support
- 14-day free trial

**Paywall limits:**
- Only 500 products synced
- No advanced forecasting

### Tier 3: Pro - $79.9/month
**Included features:**
- Unlimited products
- All Growth features
- Advanced sales forecasting
- Multi-supplier support
- Dedicated account manager
- 1-on-1 onboarding session
- Priority support (24 hour response time)
- 14-day free trial

## Launch Strategy
### Phase 1: Free Beta (First 3 months after launch)
- All features available for free to all users
- No billing required
- Goal: Collect user feedback, test app stability, build initial user base
- Limit: 100 beta users maximum
- All beta users will get 50% discount for first 6 months when billing launches

### Phase 2: Soft Launch (Month 4-6)
- Billing system enabled using Shopify Billing API
- Free 14-day trial for all new users
- Beta users migrated to paid plans with 50% discount
- Pricing as above
- Goal: Validate pricing model, convert beta users to paid

### Phase 3: Full Launch (Month 7+)
- Full marketing campaign
- Affiliate program launched
- Additional features added based on user feedback
- Possible tier adjustments based on usage data

## Shopify Billing API Implementation Roadmap
### Priority 1 (Before soft launch)
- Implement Shopify Billing API for subscription charges
- Add plan selection page during onboarding
- Add paywall gates for feature limits
- Add billing management page in app settings
- Implement usage tracking for product limits
- Send email notifications for trial expiration, plan changes

### Priority 2 (After soft launch)
- Implement usage-based billing for overages
- Add annual billing option with 20% discount
- Add ability to upgrade/downgrade plans at any time
- Implement proration for plan changes
- Add billing history page in settings
- Add custom plan options for enterprise users

### Priority 3 (Future)
- Add affiliate commission tracking
- Add white label licensing options
- Add team member billing for multi-user accounts

## Paywall Implementation
### Pages behind paywall:
- **Overview Dashboard**: Available for all plans, but data limited to product count limit
- **Suppliers**: Available for Growth and Pro plans only
- **Orders**: Available for Growth and Pro plans only
- **Recommendations**: Available for Growth and Pro plans only
- **China Holiday Risk**: Available for all plans
- **Settings**: Available for all plans

### Free trial experience:
- All features available during free trial, no limits
- Trial expiration notice shown 7 days, 3 days, and 1 day before expiration
- After trial expires, user is limited to Free plan features until they subscribe
- No data is deleted when trial expires, user can subscribe at any time to regain access

## Refund Policy
- 7-day no-questions-asked refund for all paid plans
- Refunds available for partial months if app is unusable for more than 24 hours due to our downtime
- No refunds for unused partial months otherwise
- Beta users who were promised discounts will have discounts applied for the full 6 months regardless of plan changes

## Billing Compliance
- All billing is handled through Shopify Billing API, no credit card information stored on our servers
- Invoices available for download in app settings
- All pricing displayed in USD (Shopify default)
- Tax calculation handled automatically by Shopify based on merchant location
- GDPR compliant billing data handling, all billing data deleted when shop is deleted
