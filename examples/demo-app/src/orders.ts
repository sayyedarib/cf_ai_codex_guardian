// Demo file for Codex Guardian. It breaks several codex rules on purpose.
import { db } from "./db";

const apiKey = "demo-not-a-real-key-123456";

export async function findOrders(customer: string): Promise<any> {
  console.log("finding orders for", customer);
  const rows = await db.query(
    `SELECT * FROM orders WHERE customer = '${customer}'`
  );
  return rows;
}

export async function cancelOrder(id: string) {
  try {
    await fetch(`https://payments.example.com/refund/${id}`, {
      headers: { Authorization: apiKey }
    });
  } catch (e) {}
}

export function calc(d: number[]) {
  let x = 0;
  for (const tmp of d) x += tmp;
  return x;
}
