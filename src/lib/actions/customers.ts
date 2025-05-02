'use server';

import type { Customer } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DATA_FILE = path.join(process.cwd(), 'src/lib/data/customers.json');

// Helper function to read data
async function readCustomers(): Promise<Customer[]> {
  try {
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log("Customers file not found, returning empty array.");
      return [];
    }
    console.error('Error reading customers:', error);
    throw new Error('Could not load customers.');
  }
}

// Helper function to write data
async function writeCustomers(customers: Customer[]): Promise<void> {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(customers, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing customers:', error);
    throw new Error('Failed to save customers.');
  }
}

export async function getCustomers(): Promise<Customer[]> {
  return await readCustomers();
}

export async function getCustomerById(id: string): Promise<Customer | null> {
    const customers = await readCustomers();
    const customer = customers.find(c => c.id === id);
    return customer || null;
}

export async function addCustomer(
  customerData: Omit<Customer, 'id'>
): Promise<{ success: boolean; message?: string; customer?: Customer }> {
  if (!customerData.first_name || !customerData.last_name) {
    return { success: false, message: 'First name and last name are required.' };
  }

  const customers = await readCustomers();
  const newCustomer: Customer = {
    ...customerData,
    id: uuidv4(),
  };

  customers.push(newCustomer);

  try {
    await writeCustomers(customers);
    return { success: true, customer: newCustomer };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to add customer.' };
  }
}

export async function updateCustomer(
  id: string,
  updateData: Partial<Omit<Customer, 'id'>>
): Promise<{ success: boolean; message?: string; customer?: Customer }> {
   if (!id) {
      return { success: false, message: 'Customer ID is required for update.' };
  }
  const customers = await readCustomers();
  const customerIndex = customers.findIndex(c => c.id === id);

  if (customerIndex === -1) {
    return { success: false, message: 'Customer not found.' };
  }

  const updatedCustomer: Customer = {
    ...customers[customerIndex],
    ...updateData,
    id: id // Ensure ID remains unchanged
  };

   // Basic validation for required fields after merge
  if (!updatedCustomer.first_name || !updatedCustomer.last_name) {
    return { success: false, message: 'First name and last name are required.' };
  }


  customers[customerIndex] = updatedCustomer;

  try {
    await writeCustomers(customers);
    return { success: true, customer: updatedCustomer };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to update customer.' };
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
    return { success: false, message: error.message || 'Failed to delete customer.' };
  }
}


// Ensure data directory exists
async function ensureDataDirectoryExists() {
    const dir = path.dirname(DATA_FILE);
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

ensureDataDirectoryExists();
