// src/lib/data-access/products.ts
import fs from "fs/promises"; // Use fs/promises
import path from "path";
import type { Product } from "@/lib/types";
import { logger } from "@/lib/services/logging";

const DATA_ACCESS_LOG_PREFIX = "ProductDataAccess";
const dataDirectory = path.join(process.cwd(), "src/lib/data");
const productsFilePath = path.join(dataDirectory, "products.json");

// Reads the products data file
async function readProductsFile(): Promise<Product[]> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:readProductsFile`;
  try {
    await fs.mkdir(dataDirectory, { recursive: true });
    const data = await fs.readFile(productsFilePath, "utf8");
    await logger.debug(
      funcPrefix,
      `Successfully read products file: ${productsFilePath}`,
    );
    return JSON.parse(data) as Product[];
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === "ENOENT") {
      await logger.warn(
        funcPrefix,
        `Products file not found at ${productsFilePath}, returning empty array.`,
      );
      return []; // File doesn't exist, return empty array
    }
    await logger.error(
      funcPrefix,
      `Error reading products file: ${productsFilePath}`,
      error,
    );
    throw new Error(`Failed to read products data: ${error instanceof Error ? error.message : String(error)}`); // Re-throw other errors
  }
}

// Writes the products data file
async function writeProductsFile(products: Product[]): Promise<void> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:writeProductsFile`;
  try {
    await fs.mkdir(dataDirectory, { recursive: true });
    await fs.writeFile(productsFilePath, JSON.stringify(products, null, 2));
    await logger.debug(
      funcPrefix,
      `Successfully wrote products file: ${productsFilePath}`,
    );
  } catch (error: unknown) {
    await logger.error(
      funcPrefix,
      `Error writing products file: ${productsFilePath}`,
      error,
    );
    throw new Error(`Failed to write products data: ${error instanceof Error ? error.message : String(error)}`); // Re-throw error
  }
}

export async function getAllProducts(): Promise<Product[]> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getAllProducts`;
  await logger.debug(funcPrefix, "Attempting to get all products.");
  try {
    return await readProductsFile();
  } catch (error) {
    await logger.error(funcPrefix, "Error retrieving all products",
      error instanceof Error ? error : new Error(String(error)));
    return []; // Return empty array on error
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getProductById:${id}`;
  await logger.debug(funcPrefix, "Attempting to get product by ID.");
  try {
    const products = await readProductsFile();
    const product = products.find((p) => p.id === id);
    if (product) {
      await logger.debug(funcPrefix, "Product found.");
    } else {
      await logger.debug(funcPrefix, "Product not found.");
    }
    return product || null;
  } catch (error) {
    await logger.error(funcPrefix, "Error retrieving product by ID",
      error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

// Renamed from saveProducts to be more specific
export async function saveAllProducts(products: Product[]): Promise<boolean> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:saveAllProducts`;
  await logger.debug(
    funcPrefix,
    `Attempting to save ${products.length} products.`,
  );
  try {
    await writeProductsFile(products);
    await logger.info(funcPrefix, "Products saved successfully.");
    return true;
  } catch (error) {
    await logger.error(funcPrefix, "Error saving products",
      error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

// Changed parameter to match Product type, ensures ID is present
export async function createProduct(product: Product): Promise<Product | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:createProduct`;
  await logger.debug(
    funcPrefix,
    `Attempting to create product with ID: ${product.id}`,
  );
  try {
    const products = await readProductsFile();
    // Check if product with the same ID already exists
    if (products.some((p) => p.id === product.id)) {
      await logger.warn(
        funcPrefix,
        `Product with ID ${product.id} already exists. Creation aborted.`,
      );
      return null; // Or throw an error if preferred
    }
    products.push(product);
    await writeProductsFile(products);
    await logger.info(
      funcPrefix,
      `Product created successfully: ${product.id}`,
    );
    return product;
  } catch (error) {
    await logger.error(funcPrefix, "Error creating product",
      error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

// Parameter expects only the fields to update, excluding ID
export async function updateProduct(
  id: string,
  updatedData: Partial<Omit<Product, "id">>,
): Promise<Product | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:updateProduct:${id}`;
  await logger.debug(funcPrefix, "Attempting to update product.");
  try {
    const products = await readProductsFile();
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) {
      await logger.warn(funcPrefix, "Product not found for update.");
      return null; // Product not found
    }

    products[index] = { ...products[index], ...updatedData };
    await writeProductsFile(products);
    await logger.info(funcPrefix, "Product updated successfully.");
    return products[index];
  } catch (error) {
    await logger.error(funcPrefix, "Error updating product",
      error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

export async function deleteProduct(id: string): Promise<boolean> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:deleteProduct:${id}`;
  await logger.debug(funcPrefix, "Attempting to delete product.");
  try {
    const products = await readProductsFile();
    const initialLength = products.length;
    const filteredProducts = products.filter((p) => p.id !== id);

    if (filteredProducts.length === initialLength) {
      await logger.warn(funcPrefix, "Product not found for deletion.");
      return false; // Product not found
    }

    await writeProductsFile(filteredProducts);
    await logger.info(funcPrefix, "Product deleted successfully.");
    return true;
  } catch (error) {
    await logger.error(funcPrefix, "Error deleting product",
      error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}
