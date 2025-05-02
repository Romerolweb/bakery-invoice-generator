'use server';

import type { Product } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

// Ensure you have uuid installed: npm install uuid @types/uuid

const DATA_FILE = path.join(process.cwd(), 'src/lib/data/products.json');

// Helper function to read data
async function readProducts(): Promise<Product[]> {
  try {
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // If file doesn't exist, return an empty array
      console.log("Products file not found, returning empty array.");
      return [];
    }
    console.error('Error reading products:', error);
    throw new Error('Could not load products.');
  }
}

// Helper function to write data
async function writeProducts(products: Product[]): Promise<void> {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing products:', error);
    throw new Error('Failed to save products.');
  }
}

export async function getProducts(): Promise<Product[]> {
  return await readProducts();
}

export async function getProductById(id: string): Promise<Product | null> {
    const products = await readProducts();
    const product = products.find(p => p.id === id);
    return product || null;
}


export async function addProduct(
  productData: Omit<Product, 'id'>
): Promise<{ success: boolean; message?: string; product?: Product }> {
  if (!productData.name || productData.unit_price == null || productData.unit_price < 0 || productData.GST_applicable == null) {
    return { success: false, message: 'Product name, unit price (non-negative), and GST applicability are required.' };
  }

  const products = await readProducts();
  const newProduct: Product = {
    ...productData,
    id: uuidv4(), // Assign a new unique ID
    unit_price: Number(productData.unit_price) // Ensure price is a number
  };

  products.push(newProduct);

  try {
    await writeProducts(products);
    return { success: true, product: newProduct };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to add product.' };
  }
}

export async function updateProduct(
  id: string,
  updateData: Partial<Omit<Product, 'id'>>
): Promise<{ success: boolean; message?: string; product?: Product }> {
  if (!id) {
      return { success: false, message: 'Product ID is required for update.' };
  }
   if (updateData.unit_price != null && updateData.unit_price < 0) {
     return { success: false, message: 'Unit price cannot be negative.' };
  }


  const products = await readProducts();
  const productIndex = products.findIndex(p => p.id === id);

  if (productIndex === -1) {
    return { success: false, message: 'Product not found.' };
  }

  // Ensure unit_price is treated as a number if present
  const price = updateData.unit_price !== undefined ? Number(updateData.unit_price) : products[productIndex].unit_price;

  const updatedProduct: Product = {
    ...products[productIndex],
    ...updateData,
    unit_price: price, // Ensure price is a number
    id: id // Ensure ID remains unchanged
  };

  // Validate updated product
   if (!updatedProduct.name || updatedProduct.unit_price == null || updatedProduct.GST_applicable == null) {
    return { success: false, message: 'Product name, unit price, and GST applicability are required fields.' };
  }

  products[productIndex] = updatedProduct;

  try {
    await writeProducts(products);
    return { success: true, product: updatedProduct };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to update product.' };
  }
}

export async function deleteProduct(
  id: string
): Promise<{ success: boolean; message?: string }> {
   if (!id) {
      return { success: false, message: 'Product ID is required for deletion.' };
  }
  const products = await readProducts();
  const initialLength = products.length;
  const updatedProducts = products.filter(p => p.id !== id);

  if (updatedProducts.length === initialLength) {
    return { success: false, message: 'Product not found.' };
  }

  try {
    await writeProducts(updatedProducts);
    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to delete product.' };
  }
}


// Ensure data directory exists - copied from seller.ts, could be refactored to a shared util
async function ensureDataDirectoryExists() {
    const dir = path.dirname(DATA_FILE);
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

ensureDataDirectoryExists();
