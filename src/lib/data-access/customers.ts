import type { Customer } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/services/logging";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const DATA_ACCESS_LOG_PREFIX = "CustomerDataAccess";

export async function getAllCustomers(): Promise<Customer[]> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getAllCustomers`;
  await logger.debug(funcPrefix, "Attempting to get all customers.");
  try {
    const result = await db.select().from(customers);
    // Drizzle returns objects matching the table schema. Need to verify customer_type enum compatibility if strict.
    // The schema defines customer_type as text with enum check, but TypeScript sees it as string unless cast.
    return result as Customer[];
  } catch (error) {
    await logger.error(funcPrefix, "Error retrieving all customers",
      error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getCustomerById:${id}`;
  await logger.debug(funcPrefix, "Attempting to get customer by ID.");
  try {
    const result = await db.select().from(customers).where(eq(customers.id, id));
    const customer = result[0];
    if (customer) {
      await logger.debug(funcPrefix, "Customer found.");
    } else {
      await logger.debug(funcPrefix, "Customer not found.");
    }
    return (customer as Customer) || null;
  } catch (error) {
    await logger.error(funcPrefix, "Error retrieving customer by ID",
      error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

export async function createCustomer(
  customerData: Omit<Customer, "id">,
): Promise<Customer | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:createCustomer`;
  await logger.debug(funcPrefix, "Attempting to create customer.");
  try {
    const newId = uuidv4();
    const newCustomer = { ...customerData, id: newId };

    // Drizzle insert
    const result = await db.insert(customers).values(newCustomer).returning();

    if (result && result.length > 0) {
        await logger.info(
        funcPrefix,
        `Customer created successfully with ID: ${newId}`,
        );
        return result[0] as Customer;
    }
    return null;
  } catch (error) {
    await logger.error(funcPrefix, "Error creating customer",
      error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

export async function updateCustomer(
  id: string,
  updatedData: Partial<Omit<Customer, "id">>,
): Promise<Customer | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:updateCustomer:${id}`;
  await logger.debug(funcPrefix, "Attempting to update customer.");
  try {
    const result = await db.update(customers)
      .set(updatedData)
      .where(eq(customers.id, id))
      .returning();

    if (result.length === 0) {
      await logger.warn(funcPrefix, "Customer not found for update.");
      return null;
    }

    await logger.info(funcPrefix, "Customer updated successfully.");
    return result[0] as Customer;
  } catch (error) {
    await logger.error(funcPrefix, "Error updating customer",
      error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

export async function deleteCustomer(id: string): Promise<boolean> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:deleteCustomer:${id}`;
  await logger.debug(funcPrefix, "Attempting to delete customer.");
  try {
    const result = await db.delete(customers).where(eq(customers.id, id)).returning({ id: customers.id });

    if (result.length === 0) {
      await logger.warn(funcPrefix, "Customer not found for deletion.");
      return false;
    }

    await logger.info(funcPrefix, "Customer deleted successfully.");
    return true;
  } catch (error) {
    await logger.error(funcPrefix, "Error deleting customer",
      error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}
