// src/lib/data-access/customers.ts
import fs from 'fs/promises'; // Direct import
import path from 'path';
import type { Customer } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator
import { logger } from '@/lib/services/logging';

const DATA_ACCESS_LOG_PREFIX = 'CustomerDataAccess';
const dataDirectory = path.join(process.cwd(), 'src/lib/data');
const customersFilePath = path.join(dataDirectory, 'customers.json');

// Reads the customers data file
async function readCustomersFile(): Promise<Customer[]> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:readCustomersFile`;
  try {
    const data = await fs.readFile(customersFilePath, 'utf8');
    logger.debug(funcPrefix, `Successfully read customers file: ${customersFilePath}`);
    return JSON.parse(data) as Customer[];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.warn(funcPrefix, `Customers file not found at ${customersFilePath}, returning empty array.`);
      return []; // File doesn't exist, return empty array
    }
    logger.error(funcPrefix, `Error reading customers file: ${customersFilePath}`, error);
    throw new Error(`Failed to read customers data: ${error.message}`); // Re-throw other errors
  }
}

// Writes the customers data file
async function writeCustomersFile(customers: Customer[]): Promise<void> {
   const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:writeCustomersFile`;
  try {
    await fs.writeFile(customersFilePath, JSON.stringify(customers, null, 2));
    logger.debug(funcPrefix, `Successfully wrote customers file: ${customersFilePath}`);
  } catch (error: any) {
     logger.error(funcPrefix, `Error writing customers file: ${customersFilePath}`, error);
     throw new Error(`Failed to write customers data: ${error.message}`); // Re-throw error
  }
}

export async function getAllCustomers(): Promise<Customer[]> {
   const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getAllCustomers`;
   logger.debug(funcPrefix, 'Attempting to get all customers.');
  try {
    return await readCustomersFile();
  } catch (error) {
     logger.error(funcPrefix, 'Error retrieving all customers', error);
     // Decide if returning empty array or throwing is better. Returning empty for now.
     return [];
  }
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getCustomerById:${id}`;
  logger.debug(funcPrefix, 'Attempting to get customer by ID.');
  try {
    const customers = await readCustomersFile();
    const customer = customers.find(c => c.id === id);
    if (customer) {
        logger.debug(funcPrefix, 'Customer found.');
    } else {
        logger.debug(funcPrefix, 'Customer not found.');
    }
    return customer || null;
  } catch (error) {
     logger.error(funcPrefix, 'Error retrieving customer by ID', error);
     return null;
  }
}

// Use Omit<Customer, 'id'> to ensure the caller doesn't provide an ID
export async function createCustomer(customerData: Omit<Customer, 'id'>): Promise<Customer | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:createCustomer`;
  logger.debug(funcPrefix, 'Attempting to create customer.');
  try {
    const customers = await readCustomersFile();
    const newCustomer: Customer = { ...customerData, id: uuidv4() }; // Generate UUID here
    customers.push(newCustomer);
    await writeCustomersFile(customers);
    logger.info(funcPrefix, `Customer created successfully with ID: ${newCustomer.id}`);
    return newCustomer;
  } catch (error) {
     logger.error(funcPrefix, 'Error creating customer', error);
     return null;
  }
}

// Use Partial<Omit<Customer, 'id'>> for updates, ID is separate
export async function updateCustomer(id: string, updatedData: Partial<Omit<Customer, 'id'>>): Promise<Customer | null> {
   const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:updateCustomer:${id}`;
   logger.debug(funcPrefix, 'Attempting to update customer.');
  try {
    const customers = await readCustomersFile();
    const customerIndex = customers.findIndex(c => c.id === id);
    if (customerIndex === -1) {
       logger.warn(funcPrefix, 'Customer not found for update.');
       return null; // Customer not found
    }
    // Merge existing customer with updated data, ensuring ID remains the same
    customers[customerIndex] = { ...customers[customerIndex], ...updatedData };
    await writeCustomersFile(customers);
    logger.info(funcPrefix, 'Customer updated successfully.');
    return customers[customerIndex];
  } catch (error) {
     logger.error(funcPrefix, 'Error updating customer', error);
     return null;
  }
}

export async function deleteCustomer(id: string): Promise<boolean> {
   const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:deleteCustomer:${id}`;
   logger.debug(funcPrefix, 'Attempting to delete customer.');
  try {
    const customers = await readCustomersFile();
    const initialLength = customers.length;
    const filteredCustomers = customers.filter(c => c.id !== id);

    if (filteredCustomers.length === initialLength) {
       logger.warn(funcPrefix, 'Customer not found for deletion.');
       return false; // Customer not found
    }

    await writeCustomersFile(filteredCustomers);
    logger.info(funcPrefix, 'Customer deleted successfully.');
    return true;
  } catch (error) {
     logger.error(funcPrefix, 'Error deleting customer', error);
     return false;
  }
}
