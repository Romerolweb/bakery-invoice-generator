import { Product } from '@/lib/types';
import * as productData from '@/lib/data-access/products';

export async function getAllProducts(): Promise<Product[]> {
  try {
    return await productData.getAllProducts();
  } catch (error) {
    console.error("Error fetching all products:", error);
    throw new Error("Failed to fetch all products");
  }
}

export async function getProductById(productId: string): Promise<Product | null> {
  try {
    return await productData.getProductById(productId);
  } catch (error) {
    console.error(`Error fetching product with ID ${productId}:`, error);
    throw new Error(`Failed to fetch product with ID ${productId}`);
  }
}