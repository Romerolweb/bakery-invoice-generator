import type { Product } from "@/lib/types";
import { logger } from "@/lib/services/logging";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const DATA_ACCESS_LOG_PREFIX = "ProductDataAccess";

export async function getAllProducts(): Promise<Product[]> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getAllProducts`;
  await logger.debug(funcPrefix, "Attempting to get all products.");
  try {
    const result = await db.select().from(products);
    return result as Product[];
  } catch (error) {
    await logger.error(funcPrefix, "Error retrieving all products",
      error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:getProductById:${id}`;
  await logger.debug(funcPrefix, "Attempting to get product by ID.");
  try {
    const result = await db.select().from(products).where(eq(products.id, id));
    const product = result[0];
    if (product) {
      await logger.debug(funcPrefix, "Product found.");
    } else {
      await logger.debug(funcPrefix, "Product not found.");
    }
    return (product as Product) || null;
  } catch (error) {
    await logger.error(funcPrefix, "Error retrieving product by ID",
      error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

export async function saveAllProducts(productsData: Product[]): Promise<boolean> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:saveAllProducts`;
  await logger.debug(
    funcPrefix,
    `Attempting to save ${productsData.length} products.`,
  );
  try {
    // Transactional save: delete all then insert all to mimic file overwrite behavior
    // Sync for better-sqlite3
    db.transaction((tx) => {
      tx.delete(products).run();
      if (productsData.length > 0) {
        tx.insert(products).values(productsData).run();
      }
    });

    await logger.info(funcPrefix, "Products saved successfully.");
    return true;
  } catch (error) {
    await logger.error(funcPrefix, "Error saving products",
      error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

export async function createProduct(product: Product): Promise<Product | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:createProduct`;
  await logger.debug(
    funcPrefix,
    `Attempting to create product with ID: ${product.id}`,
  );
  try {
    // Check if product exists first
    const existing = await db.select().from(products).where(eq(products.id, product.id));
    if (existing.length > 0) {
      await logger.warn(
        funcPrefix,
        `Product with ID ${product.id} already exists. Creation aborted.`,
      );
      return null;
    }

    const result = await db.insert(products).values(product).returning();
    await logger.info(
      funcPrefix,
      `Product created successfully: ${product.id}`,
    );
    return result[0] as Product;
  } catch (error) {
    await logger.error(funcPrefix, "Error creating product",
      error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

export async function updateProduct(
  id: string,
  updatedData: Partial<Omit<Product, "id">>,
): Promise<Product | null> {
  const funcPrefix = `${DATA_ACCESS_LOG_PREFIX}:updateProduct:${id}`;
  await logger.debug(funcPrefix, "Attempting to update product.");
  try {
    const result = await db.update(products)
      .set(updatedData)
      .where(eq(products.id, id))
      .returning();

    if (result.length === 0) {
      await logger.warn(funcPrefix, "Product not found for update.");
      return null;
    }

    await logger.info(funcPrefix, "Product updated successfully.");
    return result[0] as Product;
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
    const result = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });

    if (result.length === 0) {
      await logger.warn(funcPrefix, "Product not found for deletion.");
      return false;
    }

    await logger.info(funcPrefix, "Product deleted successfully.");
    return true;
  } catch (error) {
    await logger.error(funcPrefix, "Error deleting product",
      error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}
