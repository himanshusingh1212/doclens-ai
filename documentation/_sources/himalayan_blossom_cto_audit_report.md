# 🍯 CTO Audit Report — Himalayan Blossom E-commerce Site

**Date:** March 18, 2026  
**Scope:** Full codebase review against modern e-commerce benchmarks (Shopify, Amazon, BigBasket, Meesho)  
**Focus:** Ease of buying honey, order tracking, and overall purchase funnel

---

## Executive Summary

> [!CAUTION]
> The site is **functionally incomplete** in several critical areas. A customer today cannot: see real prices, receive a confirmation email, track their order, or get a delivery estimate. These are table-stakes features on any e-commerce platform.

The architecture is well-structured (Firebase Auth + Firestore + Razorpay + Vercel serverless), but the _customer-facing purchase experience_ has major gaps that will cause **high drop-off rates** and **zero repeat purchases**.

---

## 🔴 CRITICAL GAPS (Will Kill Conversions)

### 1. Missing: Product Prices on the Collection Page

**File:** `collection.html`, `data/menu.json`, `assets/js/site.js` (lines 27–31)

The prices hardcoded in the system are **₹1, ₹2, ₹3** for 250g / 500g / 1000g respectively — clearly test/placeholder values. The product cards in `collection.html` **do not display any price at all**. On every competitor site (Amul, Dabur, Amazon), price is shown prominently on grid cards.

**Impact:** Customers cannot evaluate value before adding to cart. This is e-commerce 101.

```diff
// menu.json has NO price field at all
// site.js DEFAULT_PRICING:
- '250 gram': 1,   // ← ₹1?? Placeholder, not real
- '500 gram': 2,
- '1000 gram': 3,
```

---

### 2. Missing: No Order Confirmation Page or Email

**File:** `assets/js/checkout.js` (line 102)

After payment success, the user is just redirected to:

```js
window.location.href = "index.html?payment=success"; // ← Home page!
```

There is **no** order confirmation page, no order summary shown, and no email sent. Every e-commerce site (Amazon, Flipkart, etc.) shows a dedicated "Thank you" page with order ID and sends a confirmation email.

**What's missing:**

- `order-confirmation.html` page (doesn't exist)
- Confirmation email via Firebase Functions / SendGrid / Nodemailer
- The order ID (`razorpay_order_id`) is available but never shown to the customer

---

### 3. Missing: Zero Order Tracking

**File:** `api/verify-payment.js` (lines 70–92), `firestore.rules`

Orders ARE saved to Firestore at `users/{uid}/orders/{orderId}`, but there is:

- **No "My Orders" page** — customers cannot view past orders
- **No order status** beyond "paid" (no: Processing → Packed → Shipped → Delivered)
- **No tracking number** field in the order schema
- **No shipping date** or estimated delivery
- **No Firestore rule** for sub-collection orders (the rules cover `/orders/{orderId}` at root, not `users/{uid}/orders` sub-collection — a potential security gap too)

This means customers must call/WhatsApp to know where their honey is. This is the **#1 post-purchase frustration**.

---

### 4. Missing: No Delivery Address Collection

**File:** `checkout.js`, `api/create-order.js`

The entire checkout flow **never asks for a delivery address**. The order saved in Firestore has `items`, `amount`, `paymentStatus` — but no `shippingAddress`. You cannot ship physical goods without an address.

**What's missing:** A checkout step / form to collect:

- Full name, phone number
- Street address, city, state, PIN code

---

### 5. Missing: No Phone Number for Prefill / OTP

**File:** `assets/js/checkout.js` (line 56)

```js
contact: ""; // Could ask user for this?
```

This comment has been sitting there as a known gap, meaning Razorpay cannot:

- Prefill the user's phone
- Send payment OTP to correct number
- Show on payment receipt

---

## 🟠 HIGH-PRIORITY GAPS (Will Hurt Retention)

### 6. No Guest Checkout

**File:** `assets/js/checkout.js` (lines 17–21)

Customers **must create an account** to pay. No competitor enforces this for a simple purchase. This alone causes significant cart abandonment (industry average: 35% abandonment due to forced login).

```js
if (!window.Auth || !window.Auth.isAuthenticated()) {
    alert('Please sign in to proceed with payment.'); // 🚫 Hard block
```

**Fix:** Allow checkout with just email + phone + address without account creation.

---

### 7. No Size Pricing Shown in the Pre-order Modal

**File:** `collection.html` (lines 259–282)

When a user clicks "Pre-order Now" and the modal opens with size options (250g / 500g / 1000g), the modal shows **size labels only — no prices**. The user is asked to pick a size without knowing how much it costs.

```html
<span data-en="250 gram">250 gram</span>
<!-- ← No price shown -->
<span data-en="500 gram">500 gram</span>
<span data-en="1000 gram">1000 gram</span>
```

---

### 8. "Edit Notes" Uses `window.prompt()`

**File:** `assets/js/site.js` (line 1352)

```js
const nextNote = window.prompt(cartText("notesPlaceholder"), currentNote || "");
```

`window.prompt()` is a browser native dialog — ugly, inconsistent, can be blocked on mobile browsers. This should be an inline text input that expands in the cart item row.

---

### 9. No Stock / Availability Indicator

**File:** `data/menu.json`, `collection.html`

Products are listed as permanently available. There is no:

- "X jars left" counter
- "Out of Stock" badge
- "Notify me when available" mechanism

For a **pre-order, limited-batch** product, showing scarcity is a massive conversion tool. Sites like Zomato Market and specialty food stores make this their core selling mechanism.

---

### 10. No Product Detail Page (PDP)

**File:** `collection.html`

Clicking on a product opens a **modal** (the `productModal`), but there's no individual product URL like `/product/van-amrit`. This means:

- Products can't be shared via URL
- Google cannot index individual products (SEO loss)
- Customers cannot bookmark a specific product
- No space for detailed content: ingredients, certifications, origin stories, lab reports

---

## 🟡 MEDIUM-PRIORITY GAPS (Will Hurt Growth)

### 11. No Coupon / Discount Code Support

No coupon field anywhere. This blocks running promotions, referral programs, or first-purchase discounts — all standard acquisition tools.

### 12. No "Save for Later" or Wishlist

Customers viewing 8 honey varieties may want to bookmark favorites. No wishlist exists.

### 13. Cart Disabled Copy is Present but Confusing

**File:** `assets/js/site.js` (lines 39–42)

```js
const CART_DISABLED_COPY = {
    en: 'Online cart checkout is no longer available.',
```

This message exists in the codebase, suggesting the feature was disabled at some point. If it's shown to users, it creates distrust and confusion.

### 14. No Estimated Delivery Date

Buyers of premium food products want to know when to expect delivery. Not showing an ETA (even "3–5 business days") increases post-purchase anxiety and support tickets.

### 15. Payment Failure UX is a Generic Alert

**File:** `assets/js/checkout.js` (line 85)

```js
alert("Failed to initiate payment. Please try again.");
```

A bare `alert()` is jarring. No explanation of why it failed, no retry suggestion, no customer support link.

### 16. No "Continue Shopping" Flow After Add-to-Cart

After adding an item to cart, users are shown a page-level alert (`#cartFeedback`) but there's no modal or drawer that shows "Item added! Continue shopping or View Cart." Users don't know what happened.

### 17. No Social Proof on Collection Page (Product-Level)

Testimonials exist on the collection page but are generic carousel — not linked to individual products. On Amazon, each product has its own star rating. Even 3 reviews per product would significantly boost conversions.

### 18. No Multi-language Cart Summary

**File:** `assets/js/site.js` (lines 928–975)

The cart has `CART_TEXT` in EN and HI, but the product names stored in the cart are English-only. If a user browses in Hindi, their cart shows English product names.

---

## 🔵 ARCHITECTURE & SECURITY CONCERNS

### 19. Firestore Rule Gap for Orders Sub-collection

**File:** `firestore.rules` (lines 22–29)

```js
// This rule covers root /orders collection
match /orders/{orderId} {
    allow read: if isAuthenticated() && resource.data.userId == request.auth.uid;
}
```

But orders are actually written to `users/{uid}/orders/{orderId}` (a **sub-collection**), not the root `orders` collection. This means either the rule never applies, or the sub-collection is unprotected. Needs audit.

### 20. Price is Set on the Client Side

**File:** `assets/js/site.js` (lines 27–31), `api/create-order.js` (lines 59–70)

The price added to the cart (`pricePaise`) comes from the frontend. While `create-order.js` reads it from Firestore (`priceSnapshot`), a malicious user could manipulate cart data in Firestore before checkout. The **server should re-validate price from a trusted source** (a products collection, not the cart document).

---

## 📊 Gap Summary Table

| Feature                           | Himalayan Blossom | Shopify Basic  | Amazon |
| --------------------------------- | ----------------- | -------------- | ------ |
| Price on product card             | ❌ Missing        | ✅             | ✅     |
| Size + price in add-to-cart modal | ❌ Missing        | ✅             | ✅     |
| Individual product URL/page       | ❌ Modal only     | ✅             | ✅     |
| Guest checkout                    | ❌ Forced login   | ✅             | ✅     |
| Delivery address collection       | ❌ Missing        | ✅             | ✅     |
| Order confirmation page           | ❌ → Home page    | ✅             | ✅     |
| Order confirmation email          | ❌ Missing        | ✅             | ✅     |
| Order history / "My Orders"       | ❌ Missing        | ✅             | ✅     |
| Order tracking / status updates   | ❌ Missing        | ✅ (with apps) | ✅     |
| Stock / availability indicator    | ❌ Missing        | ✅             | ✅     |
| Coupon/promo codes                | ❌ Missing        | ✅             | ✅     |
| Estimated delivery date           | ❌ Missing        | ✅             | ✅     |
| Product-level reviews             | ❌ Missing        | ✅ (with apps) | ✅     |
| Wishlist / Save for later         | ❌ Missing        | ✅ (with apps) | ✅     |

---

## 🚀 Recommended Build Priority

**Sprint 1 (Ship blockers — 1 week):**

1. Add real prices to `menu.json` and display on product cards + modal
2. Add delivery address form before payment
3. Create `order-confirmation.html` page (show order ID, items, address)
4. Fix Firestore rules for `users/{uid}/orders` sub-collection

**Sprint 2 (Retention — 2 weeks):** 5. Build "My Orders" page — list past orders from `users/{uid}/orders` 6. Add order status field (Processing / Shipped / Delivered) + admin update flow 7. Send confirmation email via Nodemailer/SendGrid via API route 8. Replace `window.prompt()` notes with inline input

**Sprint 3 (Growth — 2–3 weeks):** 9. Individual product detail pages 10. Guest checkout (collect email at checkout without full signup) 11. Coupon code support 12. Stock counter + "Notify me" for out-of-stock
