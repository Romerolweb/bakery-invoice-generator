import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "./customers";
import { Customer } from "../types";
import { customers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

// Mock logger
vi.mock("@/lib/services/logging", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the db module
// We must do this before importing db from "@/lib/db"
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const Database = (await import("better-sqlite3")).default;
  const sqlite = new Database(":memory:");
  const testDb = drizzle(sqlite);
  return {
    db: testDb,
  };
});

// Import db AFTER the mock. This will import the mocked instance.
import { db } from "@/lib/db";

describe("Customer Data Access", () => {
  beforeAll(async () => {
    // Run migrations on the mocked (in-memory) database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: path.join(process.cwd(), "src/lib/db/migrations") });
  });

  beforeEach(async () => {
    // Clear the table before each test
    await db.delete(customers);
  });

  describe("getAllCustomers", () => {
    it("should return all customers", async () => {
      // Drizzle expects nulls for optional fields in DB
      const dbCustomer = {
        id: "1",
        customer_type: "individual",
        first_name: "John",
        last_name: "Doe",
        email: "john.doe@example.com",
        phone: "1234567890",
        address: "1 Test St",
        business_name: null,
        abn: null,
      };

      // Insert valid DB record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.insert(customers).values(dbCustomer as any);

      const result = await getAllCustomers();
      expect(result).toHaveLength(1);

      // We expect the result to match the DB record structure
      expect(result[0]).toEqual(expect.objectContaining(dbCustomer));
    });

    it("should return an empty array if no customers exist", async () => {
        const result = await getAllCustomers();
        expect(result).toEqual([]);
    });
  });

  describe("getCustomerById", () => {
    it("should return a customer by ID", async () => {
      const dbCustomer = {
        id: "1",
        customer_type: "individual",
        first_name: "John",
        last_name: "Doe",
        email: "john.doe@example.com",
        phone: "1234567890",
        address: "1 Test St",
        business_name: null,
        abn: null,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.insert(customers).values(dbCustomer as any);

      const customer = await getCustomerById("1");
      expect(customer).toEqual(expect.objectContaining(dbCustomer));
    });

    it("should return null if customer is not found", async () => {
      const customer = await getCustomerById("999");
      expect(customer).toBeNull();
    });
  });

  describe("createCustomer", () => {
    it("should create a new customer", async () => {
      const newCustomerData: Omit<Customer, "id"> = {
        customer_type: "individual",
        first_name: "Jane",
        last_name: "Smith",
        email: "jane.smith@example.com",
        phone: "0987654321",
        address: "3 New Rd",
        // business_name and abn are undefined in input
      };

      const newCustomer = await createCustomer(newCustomerData);

      expect(newCustomer).toBeDefined();
      expect(newCustomer?.id).toBeDefined();
      expect(newCustomer).toEqual(expect.objectContaining(newCustomerData));

      // Verify in DB
      const result = await db.select().from(customers).where(eq(customers.id, newCustomer!.id));
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        ...newCustomerData,
        // DB will have nulls for undefined fields
        business_name: null,
        abn: null,
      }));
    });
  });

  describe("updateCustomer", () => {
    it("should update an existing customer", async () => {
      const dbCustomer = {
        id: "1",
        customer_type: "individual",
        first_name: "John",
        last_name: "Doe",
        email: "john.doe@example.com",
        phone: "1234567890",
        address: "1 Test St",
        business_name: null,
        abn: null,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.insert(customers).values(dbCustomer as any);

      const updatedData = { first_name: "Johnny" };
      const updatedCustomer = await updateCustomer("1", updatedData);

      expect(updatedCustomer).toEqual(expect.objectContaining({ ...dbCustomer, ...updatedData }));

      // Verify in DB
      const result = await db.select().from(customers).where(eq(customers.id, "1"));
      expect(result[0].first_name).toBe("Johnny");
    });

    it("should return null if customer is not found", async () => {
      const updatedCustomer = await updateCustomer("999", { first_name: "Ghost" });
      expect(updatedCustomer).toBeNull();
    });
  });

  describe("deleteCustomer", () => {
    it("should delete an existing customer", async () => {
      const dbCustomer = {
        id: "1",
        customer_type: "individual",
        first_name: "John",
        last_name: "Doe",
        email: "john.doe@example.com",
        phone: "1234567890",
        address: "1 Test St",
        business_name: null,
        abn: null,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.insert(customers).values(dbCustomer as any);

      const deleted = await deleteCustomer("1");
      expect(deleted).toBe(true);

      // Verify in DB
      const result = await db.select().from(customers).where(eq(customers.id, "1"));
      expect(result).toHaveLength(0);
    });

    it("should return false if customer is not found", async () => {
      const deleted = await deleteCustomer("999");
      expect(deleted).toBe(false);
    });
  });
});
