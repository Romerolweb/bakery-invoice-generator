// src/lib/actions/customers.ts
'use server';

import type { Customer } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod'; // Import Zod for validation

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
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
         console.log(`Customer data directory ensured: ${DATA_DIR}`);
    } catch (error) {
        console.error('FATAL: Error creating customer data directory:', error);
        throw new Error(`Failed to ensure customer data directory exists: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Helper function to read data
async function readCustomers(): Promise<Customer[]> {
  try {
    await ensureDataDirectoryExists(); // Check before reading
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(`Customers file (${DATA_FILE}) not found, returning empty array.`);
      return [];
    }
    console.error(`Error reading customers file (${DATA_FILE}):`, error);
    throw new Error(`Could not load customers: ${error.message}`);
  }
}

// Helper function to write data
async function writeCustomers(customers: Customer[]): Promise<void> {
  try {
    await ensureDataDirectoryExists(); // Check before writing
    await fs.writeFile(DATA_FILE, JSON.stringify(customers, null, 2), 'utf-8');
  } catch (error: any) {
    console.error(`Error writing customers file (${DATA_FILE}):`, error);
    throw new Error(`Failed to save customers: ${error.message}`);
  }
}

// Run directory check once on module load
ensureDataDirectoryExists().catch(err => {
     console.error("Initial customer directory check failed on module load:", err);
});

export async function getCustomers(): Promise<Customer[]> {
  return await readCustomers();
}

export async function getCustomerById(id: string): Promise<Customer | null> {
    if (!id) return null;
    const customers = await readCustomers();
    const customer = customers.find(c => c.id === id);
    return customer || null;
}

export async function addCustomer(
  customerData: Omit<Customer, 'id'>
): Promise<{ success: boolean; message?: string; customer?: Customer; errors?: any }> {

  const validationResult = customerSchema.safeParse(customerData);

  if (!validationResult.success) {
    console.error("Validation errors:", validationResult.error.flatten());
    return { success: false, message: 'Validation failed.', errors: validationResult.error.flatten().fieldErrors };
  }

  const validData = validationResult.data;

  const customers = await readCustomers();
  const newCustomer: Customer = {
    ...validData,
    id: uuidv4(),
    // Ensure mutually exclusive fields are nulled based on type
    business_name: validData.customer_type === 'business' ? validData.business_name : undefined,
    abn: validData.customer_type === 'business' ? validData.abn : undefined,
  };

  customers.push(newCustomer);

  try {
    await writeCustomers(customers);
    return { success: true, customer: newCustomer };
  } catch (error: any) {
    return { success: false, message: `Failed to add customer: ${error.message || 'Unknown error'}` };
  }
}

export async function updateCustomer(
  id: string,
  updateData: Partial<Omit<Customer, 'id' | 'customer_type'>> & { customer_type: 'individual' | 'business' } // Ensure type is always present
): Promise<{ success: boolean; message?: string; customer?: Customer; errors?: any }> {
   if (!id) {
      return { success: false, message: 'Customer ID is required for update.' };
   }
  const customers = await readCustomers();
  const customerIndex = customers.findIndex(c => c.id === id);

  if (customerIndex === -1) {
    return { success: false, message: 'Customer not found.' };
  }

  const existingCustomer = customers[customerIndex];

   // Merge existing data with updates, ensuring type safety
  const dataToValidate = {
    ...existingCustomer,
    ...updateData,
    id: id // Keep original ID
  };

  // Re-validate the merged data
  const validationResult = customerSchema.safeParse(dataToValidate);

  if (!validationResult.success) {
      console.error("Update Validation errors:", validationResult.error.flatten());
      return { success: false, message: 'Validation failed.', errors: validationResult.error.flatten().fieldErrors };
  }

  const updatedCustomer: Customer = {
    ...validationResult.data,
     // Ensure mutually exclusive fields are nulled based on type
    business_name: validationResult.data.customer_type === 'business' ? validationResult.data.business_name : undefined,
    abn: validationResult.data.customer_type === 'business' ? validationResult.data.abn : undefined,
  };

  customers[customerIndex] = updatedCustomer;

  try {
    await writeCustomers(customers);
    return { success: true, customer: updatedCustomer };
  } catch (error: any) {
    return { success: false, message: `Failed to update customer: ${error.message || 'Unknown error'}` };
  }
}

export async function deleteCustomer(
  id: string
): Promise<{ success: boolean; message?: string }> {
   if (!id) {
      return { success: false, message: 'Customer ID is required for deletion.' };
  }
  const customers = await readCustomers();
  const initialLength = customers.length;
  const updatedCustomers = customers.filter(c => c.id !== id);

  if (updatedCustomers.length === initialLength) {
    return { success: false, message: 'Customer not found.' };
  }

  try {
    await writeCustomers(updatedCustomers);
    return { success: true };
  } catch (error: any) {
    return { success: false, message: `Failed to delete customer: ${error.message || 'Unknown error'}` };
  }
}
