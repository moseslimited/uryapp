# New African Village Menu – seed script

This adds the **New African Village Menu** under the **New African Village** branch with all drinks, dishes, and snacks items.

## Deploy the script to the server first

The error `ModuleNotFoundError: No module named 'ury.patches.seed_new_african_village_menu'` means the server does not have this file yet. Copy it from your project to the server.

**Option A – SCP from your machine (replace `your-server` with host or IP):**
```bash
scp frappe-bench/apps/ury/ury/patches/seed_new_african_village_menu.py moses@your-server:/home/moses/restaurant_erp/apps/ury/ury/patches/
```

**Option B – Create the file on the server:**  
SSH as `moses`, then ensure the directory exists and create the file:
```bash
mkdir -p /home/moses/restaurant_erp/apps/ury/ury/patches
# Then paste the contents of seed_new_african_village_menu.py into
# /home/moses/restaurant_erp/apps/ury/ury/patches/seed_new_african_village_menu.py
# (e.g. with nano or by copying from your repo.)
```

Exact path on the server: **`/home/moses/restaurant_erp/apps/ury/ury/patches/seed_new_african_village_menu.py`**

## Run the script on the server

1. SSH to the server and switch to the bench user (e.g. `moses`).
2. Go to the bench directory:
   ```bash
   cd /home/moses/restaurant_erp
   ```
3. Run the seed script for site `new_african_village`:
   ```bash
   bench --site new_african_village execute ury.patches.seed_new_african_village_menu.run
   ```

The script will:

- Create **Branch** "New African Village" if it does not exist.
- Create **URY Menu Course** "Drinks", "Dishes", "Snacks" if they do not exist.
- Create all **Item** records that are not yet in the system (with correct rates).
- Create or update **URY Menu** "New African Village Menu" with all items and courses.
- If a **URY Restaurant** exists for branch "New African Village", set this menu as its **Default Menu**.

**Note:** The two "Smirnoff Vodka Small" entries (13,000 and 18,000) are stored as two items:  
`Smirnoff Vodka Small` (13,000) and `Smirnoff Vodka Small 18K` (18,000).
