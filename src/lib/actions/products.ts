'use server';

import type { Product } from '@/lib/types';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs
import { logger } from '@/lib/services/logging'; // Import logger

const LOG_PREFIX = 'ProductsAction';

const DATA_DIR = path.join(process.cwd(), 'src/lib/data'); // Define base data directory
const DATA_FILE = path.join(DATA_DIR, 'products.json');

// Ensure data directory exists
async function ensureDataDirectoryExists() {
    const funcPrefix = `${LOG_PREFIX}:ensureDataDir`;
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
         logger.debug(funcPrefix, `Product data directory ensured: ${DATA_DIR}`);
    } catch (error) {
        logger.error(funcPrefix, 'FATAL: Error creating product data directory', error);
        throw new Error(`Failed to ensure product data directory exists: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Helper function to read data
async function readProducts(): Promise<Product[]> {
  const funcPrefix = `${LOG_PREFIX}:readProducts`;
  try {
    await ensureDataDirectoryExists(); // Check before reading
    logger.debug(funcPrefix, `Reading products from ${DATA_FILE}`);
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    const products = JSON.parse(fileContent);
    logger.info(funcPrefix, `Successfully read ${products.length} products.`);
    return products;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.warn(funcPrefix, `Products file (${DATA_FILE}) not found, returning empty array.`);
      return [];
    }
    logger.error(funcPrefix, `Error reading products file (${DATA_FILE})`, error);
    throw new Error(`Could not load products: ${error.message}`);
  }
}

// Helper function to write data
async function writeProducts(products: Product[]): Promise<void> {
  const funcPrefix = `${LOG_PREFIX}:writeProducts`;
  try {
    await ensureDataDirectoryExists(); // Check before writing
    const dataToWrite = JSON.stringify(products, null, 2);
    logger.debug(funcPrefix, `Writing ${products.length} products to ${DATA_FILE}`);
    await fs.writeFile(DATA_FILE, dataToWrite, 'utf-8');
    logger.info(funcPrefix, `Successfully wrote products data.`);
  } catch (error: any) {
    logger.error(funcPrefix, `Error writing products file (${DATA_FILE})`, error);
    throw new Error(`Failed to save products: ${error.message}`);
  }
}

// Run directory check once on module load
ensureDataDirectoryExists().catch(err => {
     logger.error(LOG_PREFIX, "Initial product directory check failed on module load", err);
});


export async function getProducts(): Promise<Product[]> {
    const funcPrefix = `${LOG_PREFIX}:getProducts`;
    logger.info(funcPrefix, "Fetching all products.");
  return await readProducts();
}

export async function getProductById(id: string): Promise<Product | null> {
    const funcPrefix = `${LOG_PREFIX}:getProductById:${id}`;
    logger.info(funcPrefix, "Fetching product by ID.");
    if (!id) {
        logger.warn(funcPrefix, "Called with empty ID.");
        return null;
    }
    const products = await readProducts();
    const product = products.find(p => p.id === id);
    if (product) {
        logger.debug(funcPrefix, "Product found.");
    } else {
        logger.warn(funcPrefix, "Product not found.");
    }
    return product || null;
}


export async function addProduct(
  productData: Omit<Product, 'id'>
): Promise<{ success: boolean; message?: string; product?: Product }> {
    const funcPrefix = `${LOG_PREFIX}:addProduct`;
    logger.info(funcPrefix, "Attempting to add new product.", productData);

  // Basic validation: check required fields and non-negative price
  if (!productData.name || productData.unit_price == null || productData.unit_price < 0 || productData.GST_applicable == null) {
    logger.warn(funcPrefix, "Validation failed: Missing required fields or invalid price.", productData);
    return { success: false, message: 'Product name, unit price (non-negative), and GST applicability are required.' };
  }
  logger.debug(funcPrefix, "Validation successful.");

  const products = await readProducts();
  const newProductId = uuidv4();
  const newProduct: Product = {
    ...productData,
    id: newProductId, // Assign a new unique ID
    unit_price: Number(productData.unit_price) // Ensure price is a number
  };

  products.push(newProduct);

  try {
    await writeProducts(products);
    logger.info(funcPrefix, `Product added successfully with ID: ${newProductId}`);
    return { success: true, product: newProduct };
  } catch (error: any) {
    logger.error(funcPrefix, "Failed to write products file after adding.", error);
    return { success: false, message: `Failed to add product: ${error.message || 'Unknown error'}` };
  }
}

export async function updateProduct(
  id: string,
  updateData: Partial<Omit<Product, 'id'>>
): Promise<{ success: boolean; message?: string; product?: Product }> {
    const funcPrefix = `${LOG_PREFIX}:updateProduct:${id}`;
    logger.info(funcPrefix, "Attempting to update product.", updateData);
  if (!id) {
      logger.warn(funcPrefix, "Update failed: No ID provided.");
      return { success: false, message: 'Product ID is required for update.' };
  }
   // Validate incoming price if provided
   if (updateData.unit_price != null && Number(updateData.unit_price) < 0) {
     logger.warn(funcPrefix, "Validation failed: Negative unit price provided.", updateData);
     return { success: false, message: 'Unit price cannot be negative.' };
  }


  const products = await readProducts();
  const productIndex = products.findIndex(p => p.id === id);

  if (productIndex === -1) {
    logger.warn(funcPrefix, "Update failed: Product not found.");
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
  logger.debug(funcPrefix, "Product data merged for update:", updatedProduct);

  // Validate the *merged* product data before saving
   if (!updatedProduct.name || updatedProduct.unit_price == null || updatedProduct.unit_price < 0 || updatedProduct.GST_applicable == null) {
    // This should ideally not happen if incoming data and existing data were valid, but good safeguard
    logger.error(funcPrefix, "Invalid product data after merge.", updatedProduct);
    return { success: false, message: 'Merged product data is invalid. Check name, price, and GST applicability.' };
  }
  logger.debug(funcPrefix, "Merged product data validation successful.");

  products[productIndex] = updatedProduct;

  try {
    await writeProducts(products);
    logger.info(funcPrefix, "Product updated successfully.");
    return { success: true, product: updatedProduct };
  } catch (error: any) {
    logger.error(funcPrefix, "Failed to write products file after update.", error);
    return { success: false, message: `Failed to update product: ${error.message || 'Unknown error'}` };
  }
}

export async function deleteProduct(
  id: string
): Promise<{ success: boolean; message?: string }> {
    const funcPrefix = `${LOG_PREFIX}:deleteProduct:${id}`;
    logger.info(funcPrefix, "Attempting to delete product.");
   if (!id) {
      logger.warn(funcPrefix, "Delete failed: No ID provided.");
      return { success: false, message: 'Product ID is required for deletion.' };
  }
  const products = await readProducts();
  const initialLength = products.length;
  const updatedProducts = products.filter(p => p.id !== id);

  if (updatedProducts.length === initialLength) {
    logger.warn(funcPrefix, "Delete failed: Product not found.");
    return { success: false, message: 'Product not found.' };
  }

  try {
    await writeProducts(updatedProducts);
    logger.info(funcPrefix, "Product deleted successfully.");
    return { success: true };
  } catch (error: any) {
    logger.error(funcPrefix, "Failed to write products file after delete.", error);
    return { success: false, message: `Failed to delete product: ${error.message || 'Unknown error'}` };
  }
}
