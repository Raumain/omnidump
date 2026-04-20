import random
from datetime import datetime, timedelta

# Tweak this number to make the file as fat as you need
NUM_ROWS = 500000
START_ID = 3000004
STATUSES = ['completed', 'pending', 'shipped', 'cancelled', 'refunded']


def random_date():
    start = datetime(2025, 1, 1)
    end = datetime(2026, 3, 26)
    dt = start + timedelta(seconds=random.randint(0,
                           int((end - start).total_seconds())))
    return dt.strftime('%Y-%m-%d %H:%M:%S')


print(
    f"Generating a CSV with {NUM_ROWS} lines... This will take a few seconds.")

with open('fat_orders7.csv', mode='w', encoding='utf-8') as f:
    # Write Header
    f.write("id,user_id,order_date,status,total_amount\n")

    # Generate Rows
    for i in range(START_ID, START_ID + NUM_ROWS):
        user_id = random.randint(1, 6)
        order_date = random_date()
        status = random.choice(STATUSES)
        total_amount = f"{random.uniform(5.0, 1500.0):.2f}"

        f.write(f"{i},{user_id},{order_date},{status},{total_amount}\n")

print("Done! Check 'fat_orders2.csv' in your directory.")
