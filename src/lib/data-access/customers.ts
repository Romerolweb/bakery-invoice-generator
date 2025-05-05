// src/lib/data-access/customers.ts

import path from 'path';

const dataDirectory = path.join(process.cwd(), 'src/lib/data');
const customersFilePath = path.join(dataDirectory, 'customers.json');

export async function getAllCustomers(): Promise<Customer[]> {
  try {
    const fs = await import('fs/promises'); // Use fs/promises
    const data = await fs.readFile(customersFilePath, 'utf8');
    return JSON.parse(data) as Customer[];
  } catch (error) {
    console.error('Error reading customers data:', error);
    return [];
  }
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  try {
    const customers = await getAllCustomers();
    const customer = customers.find(c => c.id === id);
    return customer || null;
  } catch (error) {
    console.error(`Error getting customer with ID ${id}:`, error);
    return null;
  }
}

export async function createCustomer(customer: Omit<Customer, 'id'>): Promise<Customer | null> {
  try {
    const fs = await import('fs/promises'); // Use fs/promises
    const customers = await (await import('./customers')).getAllCustomers(); // Use dynamic import here
    const newCustomer: Customer = { id: crypto.randomUUID(), ...customer };
    customers.push(newCustomer);
    await fs.writeFile(customersFilePath, JSON.stringify(customers, null, 2));
    return newCustomer;
  } catch (error) {
    console.error('Error creating customer:', error);
    return null;
  }
}

export async function updateCustomer(id: string, updatedCustomer: Partial<Omit<Customer, 'id'>>): Promise<Customer | null> {
  try {
    const fs = await import('fs/promises'); // Use fs/promises
    const customers = await (await import('./customers')).getAllCustomers(); // Use dynamic import here
    const customerIndex = customers.findIndex(c => c.id === id);
    if (customerIndex === -1) {
      return null;
    }
    customers[customerIndex] = { ...customers[customerIndex], ...updatedCustomer } as Customer;
    await fs.writeFile(customersFilePath, JSON.stringify(customers, null, 2));
    return customers[customerIndex];
  } catch (error) {
    console.error(`Error updating customer with ID ${id}:`, error);
    return null;
  }
}

export async function deleteCustomer(id: string): Promise<boolean> {
  try {
    const fs = await import('fs/promises'); // Use fs/promises
    const customers = await (await import('./customers')).getAllCustomers(); // Use dynamic import here
    const customerIndex = customers.findIndex(c => c.id === id);
    if (customerIndex === -1) {
      return false;
    }
    customers.splice(customerIndex, 1);
    await fs.writeFile(customersFilePath, JSON.stringify(customers, null, 2));
    return true;
  } catch (error) {
    console.error(`Error deleting customer with ID ${id}:`, error);
    return false;
  }
}