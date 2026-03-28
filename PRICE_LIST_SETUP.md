# POS Price List Setup

The POS now uses **Standard Selling** only for all order types (Dine In, Take Away, Phone In, etc.). The separate "Drinks" and "Food" price lists are no longer used by the application.

## What you need to do

1. **Ensure items have a price in Standard Selling**
   - Go to **Stock > Item Price**.
   - For each item you sell in POS, ensure there is a row with **Price List** = "Standard Selling" and the correct **Price List Rate**.
   - If you had prices in "Drinks" or "Food", you can copy those rates into Standard Selling (e.g. use **Stock > Item Price**, filter by the old price list, then create new rows for Standard Selling with the same item and rate).

2. **Optionally remove or disable Drinks and Food price lists**
   - Go to **Stock > Price List**.
   - Open "Drinks" and "Food" and either:
     - Set **Disabled** = 1 (so they are no longer used), or
     - Delete them if you do not need them for anything else.

3. **Aggregators**
   - Aggregator orders still use the price list set in **Branch > Aggregator Settings** per customer. Only non-aggregator POS orders use Standard Selling.

## Editing price in POS

When you click the **pencil (edit)** icon on an item in the cart, the product dialog opens. In **edit mode** you will see a **Price (per unit)** field. Change it and click **Update Order** to save the custom price for that line.
