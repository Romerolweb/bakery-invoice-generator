import { Customer } from '@/lib/types';
import * as CustomerDataAccess from '@/lib/data-access/customers';

export async function getAllCustomers(): Promise<Customer[]> {
  try {
    return await CustomerDataAccess.getAllCustomers();
  } catch (error) {
    console.error("Error fetching all customers:", error);
    throw new Error("Failed to fetch customers");
  }
}

export async function getCustomerById(customerId: string): Promise<Customer | null> {
  try {
    return await CustomerDataAccess.getCustomerById(customerId);
  } catch (error) {
    console.error(`Error fetching customer by ID ${customerId}:`, error);
    throw new Error("Failed to fetch customer");
  }
}