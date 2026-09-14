import { ObjectId, type Collection, type Db, type Filter } from "mongodb";
import type { Product } from "../schemas/product.schema.js";

export type ProductDocument = Omit<Product, "id"> & { _id: ObjectId };

export interface ListOptions {
  skip?: number;
  limit?: number;
}

function collection(db: Db): Collection<ProductDocument> {
  return db.collection<ProductDocument>("products");
}

function toProduct(doc: ProductDocument): Product {
  const { _id, ...rest } = doc;
  return { id: _id.toHexString(), ...rest };
}

/**
 * Achata um objeto aninhado em pares de dot-notation (`{a: {b: 1}}` → `{"a.b": 1}`) para uso
 * em `$set` — permite ao PATCH atualizar só os campos enviados, sem sobrescrever os irmãos
 * não enviados na mesma subseção. Arrays e `Date` são tratados como valor-folha (nunca
 * achatados por índice). Chaves com valor `undefined` são omitidas (nunca tocam o campo).
 */
function flattenToDotNotation(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const isPlainObject =
      value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
    if (isPlainObject) {
      Object.assign(result, flattenToDotNotation(value as Record<string, unknown>, path));
    } else {
      result[path] = value;
    }
  }
  return result;
}

export const productRepository = {
  async findById(db: Db, id: string): Promise<Product | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await collection(db).findOne({ _id: new ObjectId(id) });
    return doc ? toProduct(doc) : null;
  },

  async findBySku(db: Db, sku: string): Promise<Product | null> {
    const doc = await collection(db).findOne({ sku });
    return doc ? toProduct(doc) : null;
  },

  async list(db: Db, filter: Filter<ProductDocument>, options: ListOptions = {}): Promise<Product[]> {
    const docs = await collection(db)
      .find(filter)
      .sort({ "identificacao.data_cadastro": -1 })
      .skip(options.skip ?? 0)
      .limit(options.limit ?? 20)
      .toArray();
    return docs.map(toProduct);
  },

  async count(db: Db, filter: Filter<ProductDocument>): Promise<number> {
    return collection(db).countDocuments(filter);
  },

  /** `input` já deve ser o documento completo, validado contra `ProductSchema` (sem `id`). */
  async create(db: Db, input: Omit<Product, "id">): Promise<Product> {
    const doc: ProductDocument = { _id: new ObjectId(), ...input };
    await collection(db).insertOne(doc);
    return toProduct(doc);
  },

  async update(db: Db, id: string, patch: Record<string, unknown>): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    const flat = flattenToDotNotation(patch);
    if (Object.keys(flat).length === 0) return;
    await collection(db).updateOne({ _id: new ObjectId(id) }, { $set: flat });
  },

  /** Exclusão lógica (constituição, princípio VIII) — nunca `deleteOne`. */
  async softDelete(db: Db, id: string): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await collection(db).updateOne({ _id: new ObjectId(id) }, { $set: { status: "inativo" } });
  },
};
