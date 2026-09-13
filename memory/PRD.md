# Kebab Blasan POS — PRD

## Overview
Mobile Point-of-Sale (POS) app for the food stall "Kebab Blasan". Built with Expo (React Native), FastAPI backend, MongoDB.

## Roles
- **Cashier** – logs in with 4-digit PIN. Runs the terminal, opens/closes shift, checks out orders.
- **Admin** – logs in with email + password. Manages menu, toppings, sees dashboard & transaction history.
- Role switcher on login screen for demo.

## Modules

### A. Cashier Terminal (`/cashier`)
- Category chips (Semua/Kebab/Snacks/Beverages) + instant text search
- 2-column product grid with photos, name, IDR price
- Customization sheet: multi-select toppings (with prices), spice level, notes, quantity
- Cart sheet: per-line topping breakdown, +/- qty, subtotal
- Checkout sheet: Cash (denomination helper + change calc) or QRIS
- Thermal-style receipt preview after payment
- Auto-prompts to open shift (Modal Kas Awal) on first entry

### B. Daily Recap / Z-Report (`/recap`)
- Totals: revenue, cash, QRIS, transaction count, avg order
- Cash reconciliation: modal awal + tunai vs. counted → variance
- Toppings sold breakdown, products sold breakdown
- Close shift button

### C. Admin Dashboard (`/admin`)
- Overview: today revenue, orders, weekly revenue, 7-day bar chart, top 5 sellers
- Menu CRUD (name, category, price, active toggle)
- Topping CRUD (name, price, availability)
- Transaction history with search + receipt view

## Data Seeds
Products: Kebab Beef Regular/Large, Kebab Chicken Regular/Large, Roti Maryam Coklat, Es Teh Manis.
Toppings: Keju Slice, Keju Mozzarella, Extra Daging, Telur, Saus Keju.

## Auth Credentials (demo)
Cashier PIN `1234`, Admin `admin@kebabblasan.id` / `admin123` (see `test_credentials.md`).

## Tech
- Frontend: Expo Router, react-native-safe-area-context, `@react-native-vector-icons/material-design-icons`, AsyncStorage.
- Backend: FastAPI + Motor + Pydantic + bcrypt + PyJWT.
- All API routes prefixed with `/api`.
