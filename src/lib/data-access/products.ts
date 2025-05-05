import { Product } from '@/lib/types';

const PRODUCTS_FILE =
 process.env.NODE_ENV === 'development' ?
 '/src/lib/data/products.json' : 'src/lib/data/products.json';

async function readData(filename: string): Promise<string> {
  const filePath = PRODUCTS_FILE;
  const res = await fetch(filePath);
  return await res.text();
}
async function writeData(filename: string, data: string): Promise<void> {
  const filePath = PRODUCTS_FILE;
  await fetch(filePath, {method: 'POST', headers: {'Content-Type': 'application/json',}, body: data});
}

export async function getAllProducts(): Promise<Product[]> {
  try {
    const data = await readData('products.json');
    const products: Product[] = JSON.parse(data);
 return products;
  } catch (error) {
 console.error('Error reading products data:', error);
 return [];
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  try {
    const products = await getAllProducts();
    const product = products.find((p) => p.id === id);
    return product || null;
  } catch (error) {
    console.error(`Error reading product data for ID ${id}:`, error);
    return null;
  }
}

export async function saveProducts(products: Product[]): Promise<boolean> {
  try {
 await writeData('products.json', JSON.stringify(products, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving products data:', error);
    return false;
  }
}

export async function addProduct(product: Product): Promise<Product | null> {
  try {
    const products = await getAllProducts();
    products.push(product);
    const success = await saveProducts(products);
    return success ? product : null;
  } catch (error) {
    console.error('Error saving product:', error);
    return null;
  }
}

export async function updateProduct(id: string, updatedProduct: Partial<Product>): Promise<Product | null> {
  try {
    const products = await getAllProducts();
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) {
      return null;
    }

    products[index] = { ...products[index], ...updatedProduct };
    const success = await saveProducts(products);
    return success ? products[index] : null;
  } catch (error) {
      console.error(`Error updating product with ID ${id}:`, error);
      return null;
  }
}

export async function deleteProduct(id: string): Promise<boolean> {
  try {
    const products = await getAllProducts();
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) {
      return false;
    }
    products.splice(index, 1);
    await saveProducts(products);
    return true;
  } catch (error) {
    console.error(`Error deleting product with ID ${id}:`, error);
    return false;
  }
}


