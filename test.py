import random
import os
from datetime import datetime, timedelta

# --- CONFIGURATION ---
FILE_NAME = 'massive_seed.sql'

# Tweak these numbers to make the file as fat as you want.
SCALE = {
    'users': 5000,
    'brands': 50,
    'categories': 20,
    'products': 1000,
    'variants': 3000,
    'warehouses': 5,
    'orders': 10000
}


def random_date(start_year=2025):
    start = datetime(start_year, 1, 1)
    end = datetime(2026, 3, 26)
    dt = start + timedelta(seconds=random.randint(0,
                           int((end - start).total_seconds())))
    return dt.strftime('%Y-%m-%d %H:%M:%S')

# --- ROW GENERATORS ---


def gen_users(i):
    return (i, f"user_{i}@example.com", "hash123", f"First{i}", f"Last{i}", random_date())


def gen_addresses(i):
    return (i, i, f"{random.randint(1,999)} Main St", None, "Tech City", "75000", "France", "true")


def gen_brands(i):
    return (i, f"Brand {i}", f"Description for brand {i}")


def gen_categories(i):
    parent_id = None if i <= 5 else random.randint(1, 5)
    return (i, parent_id, f"Category {i}")


def gen_products(i):
    return (i, random.randint(1, SCALE['brands']), f"Product {i}", f"Amazing product {i}", round(random.uniform(10, 500), 2), random_date())


def gen_variants(i):
    return (i, random.randint(1, SCALE['products']), f"SKU-{i}", f"Variant {i}", round(random.uniform(0, 50), 2))


def gen_warehouses(i):
    return (i, f"WH-{i}", "Bordeaux")


def gen_orders(i):
    user_id = random.randint(1, SCALE['users'])
    return (i, user_id, user_id, round(random.uniform(20, 1000), 2), random.choice(['pending', 'shipped', 'delivered']), random_date())


def gen_order_items(i):
    return (i, random.randint(1, SCALE['orders']), random.randint(1, SCALE['variants']), random.randint(1, 5), round(random.uniform(10, 200), 2))


# --- EXECUTION ---
TABLES = [
    ('users', ['id', 'email', 'password_hash', 'first_name',
     'last_name', 'created_at'], gen_users, SCALE['users']),
    ('addresses', ['id', 'user_id', 'address_line1', 'address_line2', 'city',
     'postal_code', 'country', 'is_default'], gen_addresses, SCALE['users']),
    ('brands', ['id', 'name', 'description'], gen_brands, SCALE['brands']),
    ('categories', ['id', 'parent_id', 'name'],
     gen_categories, SCALE['categories']),
    ('products', ['id', 'brand_id', 'name', 'description',
     'base_price', 'created_at'], gen_products, SCALE['products']),
    ('product_variants', ['id', 'product_id', 'sku', 'variant_name',
     'price_adjustment'], gen_variants, SCALE['variants']),
    ('warehouses', ['id', 'location_code', 'city'],
     gen_warehouses, SCALE['warehouses']),
    ('orders', ['id', 'user_id', 'shipping_address_id', 'total_amount',
     'status', 'created_at'], gen_orders, SCALE['orders']),
    ('order_items', ['id', 'order_id', 'variant_id', 'quantity',
     'unit_price'], gen_order_items, SCALE['orders'] * 3)
]

print(f"Generating single SQL file: {FILE_NAME}...")

with open(FILE_NAME, 'w', encoding='utf-8') as f:
    f.write("-- MASSIVE SEED DATA\n")
    f.write("BEGIN;\n\n")  # Fast transaction wrapper

    for table_name, columns, row_generator, num_rows in TABLES:
        print(f"Writing {num_rows} rows for {table_name}...")
        batch_size = 1000
        for i in range(1, num_rows + 1, batch_size):
            f.write(
                f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES\n")
            values = []
            for j in range(i, min(i + batch_size, num_rows + 1)):
                row = row_generator(j)
                formatted_row = []
                for val in row:
                    if isinstance(val, str):
                        # Fix for Python < 3.12: No backslashes in f-strings
                        safe_str = val.replace("'", "''")
                        formatted_row.append(f"'{safe_str}'")
                    elif val is None:
                        formatted_row.append("NULL")
                    else:
                        formatted_row.append(str(val))
                values.append(f"({', '.join(formatted_row)})")
            f.write(',\n'.join(values) + ';\n')
        f.write("\n")

    # Auto-reset sequences so your app can insert new data immediately
    f.write("-- Reset Sequences\n")
    for table_name, _, _, _ in TABLES:
        f.write(
            f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), coalesce(max(id), 1)) FROM {table_name};\n")

    f.write("\nCOMMIT;\n")

print(
    f"\nDone! You can now import it using: psql -U username -d your_database -f {FILE_NAME}")
