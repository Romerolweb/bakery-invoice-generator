// src/lib/actions/customers.ts
'use server';

import type { Customer } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod'; // Import Zod for validation
import { logger } from '@/lib/services/logging'; // Import logger

const LOG_PREFIX = 'CustomersAction';

const DATA_DIR = path.join(process.cwd(), 'src/lib/data'); // Define base data directory
const DATA_FILE = path.join(DATA_DIR, 'customers.json');

// --- Zod Schema for Customer Validation ---
const customerSchema = z.discriminatedUnion('customer_type', [
  z.object({
    customer_type: z.literal('individual'),
    id: z.string().optional(),
    first_name: z.string().min(1, 'First name is required for individuals.'),
    last_name: z.string().optional(),
    business_name: z.string().optional().nullable(), // Should be null/undefined for individual
    abn: z.string().optional().nullable(),          // Should be null/undefined for individual
    email: z.string().email('Invalid email format').optional().or(z.literal('')),
    phone: z.string().optional(),
    address: z.string().optional(),
  }),
  z.object({
    customer_type: z.literal('business'),
    id: z.string().optional(),
    first_name: z.string().optional(), // Contact person, optional
    last_name: z.string().optional(), // Contact person, optional
    business_name: z.string().min(1, 'Business name is required for businesses.'),
    abn: z.string().optional().refine((val) => !val || /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/.test(val), {
        message: 'Invalid ABN format (e.g., 11 111 111 111)'
    }).or(z.literal('')), // Optional ABN with format check
    email: z.string().email('Invalid email format').optional().or(z.literal('')),
    phone: z.string().optional(),
    address: z.string().optional(),
  }),
]);

// Ensure data directory exists
async function ensureDataDirectoryExists() {
    const funcPrefix = `${LOG_PREFIX}:ensureDataDir`;
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
         logger.debug(funcPrefix, `Customer data directory ensured: ${DATA_DIR}`);
    } catch (error) {
        logger.error(funcPrefix, 'FATAL: Error creating customer data directory', error);
        throw new Error(`Failed to ensure customer data directory exists: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Helper function to read data
async function readCustomers(): Promise<Customer[]> {
  const funcPrefix = `${LOG_PREFIX}:readCustomers`;
  try {
    await ensureDataDirectoryExists(); // Check before reading
    logger.debug(funcPrefix, `Reading customers from ${DATA_FILE}`);
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    const customers = JSON.parse(fileContent);
     logger.info(funcPrefix, `Successfully read ${customers.length} customers.`);
    return customers;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.warn(funcPrefix, `Customers file (${DATA_FILE}) not found, returning empty array.`);
      return [];
    }
    logger.error(funcPrefix, `Error reading customers file (${DATA_FILE})`, error);
    throw new Error(`Could not load customers: ${error.message}`);
  }
}

// Helper function to write data
async function writeCustomers(customers: Customer[]): Promise<void> {
  const funcPrefix = `${LOG_PREFIX}:writeCustomers`;
  try {
    await ensureDataDirectoryExists(); // Check before writing
    const dataToWrite = JSON.stringify(customers, null, 2);
    logger.debug(funcPrefix, `Writing ${customers.length} customers to ${DATA_FILE}`);
    await fs.writeFile(DATA_FILE, dataToWrite, 'utf-8');
    logger.info(funcPrefix, `Successfully wrote customers data.`);
  } catch (error: any) {
    logger.error(funcPrefix, `Error writing customers file (${DATA_FILE})`, error);
    throw new Error(`Failed to save customers: ${error.message}`);
  }
}

// Run directory check once on module load
ensureDataDirectoryExists().catch(err => {
     logger.error(LOG_PREFIX, "Initial customer directory check failed on module load", err);
});

export async function getCustomers(): Promise<Customer[]> {
    const funcPrefix = `${LOG_PREFIX}:getCustomers`;
    logger.info(funcPrefix, "Fetching all customers.");
  return await readCustomers();
}

export async function getCustomerById(id: string): Promise<Customer | null> {
    const funcPrefix = `${LOG_PREFIX}:getCustomerById:${id}`;
    logger.info(funcPrefix, "Fetching customer by ID.");
    if (!id) {
        logger.warn(funcPrefix, "Called with empty ID.");
        return null;
    }
    const customers = await readCustomers();
    const customer = customers.find(c => c.id === id);
     if (customer) {
         logger.debug(funcPrefix, "Customer found.");
     } else {
         logger.warn(funcPrefix, "Customer not found.");
     }
    return customer || null;
}

export async function addCustomer(
  customerData: Omit<Customer, 'id'>
): Promise<{ success: boolean; message?: string; customer?: Customer; errors?: any }> {
    const funcPrefix = `${LOG_PREFIX}:addCustomer`;
    logger.info(funcPrefix, "Attempting to add new customer.", customerData);

  const validationResult = customerSchema.safeParse(customerData);

  if (!validationResult.success) {
    const errors = validationResult.error.flatten().fieldErrors;
    logger.warn(funcPrefix, "Validation failed.", errors);
    return { success: false, message: 'Validation failed.', errors: errors };
  }

  const validData = validationResult.data;
  logger.debug(funcPrefix, "Validation successful.");

  const customers = await readCustomers();
  const newCustomerId = uuidv4();
  const newCustomer: Customer = {
    ...validData,
    id: newCustomerId,
    // Ensure mutually exclusive fields are nulled based on type
    business_name: validData.customer_type === 'business' ? validData.business_name : undefined,
    abn: validData.customer_type === 'business' ? validData.abn : undefined,
  };

  customers.push(newCustomer);

  try {
    await writeCustomers(customers);
    logger.info(funcPrefix, `Customer added successfully with ID: ${newCustomerId}`);
    return { success: true, customer: newCustomer };
  } catch (error: any) {
     logger.error(funcPrefix, "Failed to write customers file after adding.", error);
    return { success: false, message: `Failed to add customer: ${error.message || 'Unknown error'}` };
  }
}

export async function updateCustomer(
  id: string,
  updateData: Partial<Omit<Customer, 'id' | 'customer_type'>> & { customer_type: 'individual' | 'business' } // Ensure type is always present
): Promise<{ success: boolean; message?: string; customer?: Customer; errors?: any }> {
    const funcPrefix = `${LOG_PREFIX}:updateCustomer:${id}`;
    logger.info(funcPrefix, "Attempting to update customer.", updateData);
   if (!id) {
        logger.warn(funcPrefix, "Update failed: No ID provided.");
      return { success: false, message: 'Customer ID is required for update.' };
   }
  const customers = await readCustomers();
  const customerIndex = customers.findIndex(c => c.id === id);

  if (customerIndex === -1) {
     logger.warn(funcPrefix, "Update failed: Customer not found.");
    return { success: false, message: 'Customer not found.' };
  }

  const existingCustomer = customers[customerIndex];

   // Merge existing data with updates, ensuring type safety
  const dataToValidate = {
    ...existingCustomer,
    ...updateData,
    id: id // Keep original ID
  };
  logger.debug(funcPrefix, "Data prepared for validation:", dataToValidate);

  // Re-validate the merged data
  const validationResult = customerSchema.safeParse(dataToValidate);

  if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      logger.warn(funcPrefix, "Update validation failed.", errors);
      return { success: false, message: 'Validation failed.', errors: errors };
  }
  logger.debug(funcPrefix, "Update validation successful.");

  const updatedCustomer: Customer = {
    ...validationResult.data,
     // Ensure mutually exclusive fields are nulled based on type
    business_name: validationResult.data.customer_type === 'business' ? validationResult.data.business_name : undefined,
    abn: validationResult.data.customer_type === 'business' ? validationResult.data.abn : undefined,
  };

  customers[customerIndex] = updatedCustomer;

  try {
    await writeCustomers(customers);
    logger.info(funcPrefix, "Customer updated successfully.");
    return { success: true, customer: updatedCustomer };
  } catch (error: any) {
     logger.error(funcPrefix, "Failed to write customers file after update.", error);
    return { success: false, message: `Failed to update customer: ${error.message || 'Unknown error'}` };
  }
}

export async function deleteCustomer(
  id: string
): Promise<{ success: boolean; message?: string }> {
    const funcPrefix = `${LOG_PREFIX}:deleteCustomer:${id}`;
    logger.info(funcPrefix, "Attempting to delete customer.");
   if (!id) {
        logger.warn(funcPrefix, "Delete failed: No ID provided.");
      return { success: false, message: 'Customer ID is required for deletion.' };
  }
  const customers = await readCustomers();
  const initialLength = customers.length;
  const updatedCustomers = customers.filter(c => c.id !== id);

  if (updatedCustomers.length === initialLength) {
     logger.warn(funcPrefix, "Delete failed: Customer not found.");
    return { success: false, message: 'Customer not found.' };
  }

  try {
    await writeCustomers(updatedCustomers);
     logger.info(funcPrefix, "Customer deleted successfully.");
    return { success: true };
  } catch (error: any) {
     logger.error(funcPrefix, "Failed to write customers file after delete.", error);
    return { success: false, message: `Failed to delete customer: ${error.message || 'Unknown error'}` };
  }
}
