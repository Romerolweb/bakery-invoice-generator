'use server';

import type { Product } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

// Ensure you have uuid installed: npm install uuid @types/uuid

const DATA_DIR = path.join(process.cwd(), 'src/lib/data'); // Define base data directory
const DATA_FILE = path.join(DATA_DIR, 'products.json');

// Ensure data directory exists
async function ensureDataDirectoryExists() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
         console.log(`Product data directory ensured: ${DATA_DIR}`);
    } catch (error) {
        console.error('FATAL: Error creating product data directory:', error);
        throw new Error(`Failed to ensure product data directory exists: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Helper function to read data
async function readProducts(): Promise<Product[]> {
  try {
    await ensureDataDirectoryExists(); // Check before reading
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(`Products file (${DATA_FILE}) not found, returning empty array.`);
      return [];
    }
    console.error(`Error reading products file (${DATA_FILE}):`, error);
    throw new Error(`Could not load products: ${error.message}`);
  }
}

// Helper function to write data
async function writeProducts(products: Product[]): Promise<void> {
  try {
    await ensureDataDirectoryExists(); // Check before writing
    await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2), 'utf-8');
  } catch (error: any) {
    console.error(`Error writing products file (${DATA_FILE}):`, error);
    throw new Error(`Failed to save products: ${error.message}`);
  }
}

// Run directory check once on module load
ensureDataDirectoryExists().catch(err => {
     console.error("Initial product directory check failed on module load:", err);
});


export async function getProducts(): Promise<Product[]> {
  return await readProducts();
}

export async function getProductById(id: string): Promise<Product | null> {
    if (!id) return null;
    const products = await readProducts();
    const product = products.find(p => p.id === id);
    return product || null;
}


export async function addProduct(
  productData: Omit<Product, 'id'>
): Promise<{ success: boolean; message?: string; product?: Product }> {
  // Basic validation: check required fields and non-negative price
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
    return { success: false, message: `Failed to add product: ${error.message || 'Unknown error'}` };
  }
}

export async function updateProduct(
  id: string,
  updateData: Partial<Omit<Product, 'id'>>
): Promise<{ success: boolean; message?: string; product?: Product }> {
  if (!id) {
      return { success: false, message: 'Product ID is required for update.' };
  }
   // Validate incoming price if provided
   if (updateData.unit_price != null && Number(updateData.unit_price) < 0) {
     return { success: false, message: 'Unit price cannot be negative.' };
  }


  const products = await readProducts();
  const productIndex = products.findIndex(p => p.id === id);

  if (productIndex === -1) {
    return { success: false, message: 'Product not found.' };
  }

  // Ensure unit_price is treated as a number if present in updateData
  const price = updateData.unit_price !== undefined ? Number(updateData.unit_price) : products[productIndex].unit_price;

  const updatedProduct: Product = {
    ...products[productIndex],
    ...updateData, // Apply partial updates
    unit_price: price, // Use the processed price
    id: id // Ensure ID remains unchanged
  };

  // Validate the *merged* product data before saving
   if (!updatedProduct.name || updatedProduct.unit_price == null || updatedProduct.unit_price < 0 || updatedProduct.GST_applicable == null) {
    // This should ideally not happen if incoming data and existing data were valid, but good safeguard
    console.error("Invalid product data after merge:", updatedProduct);
    return { success: false, message: 'Merged product data is invalid. Check name, price, and GST applicability.' };
  }

  products[productIndex] = updatedProduct;

  try {
    await writeProducts(products);
    return { success: true, product: updatedProduct };
  } catch (error: any) {
    return { success: false, message: `Failed to update product: ${error.message || 'Unknown error'}` };
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
    return { success: false, message: `Failed to delete product: ${error.message || 'Unknown error'}` };
  }
}
