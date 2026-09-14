/**
 * Garante (idempotente) que o admin e a categoria de fixture existem no cluster de teste
 * antes dos specs rodarem. Reaproveita os módulos reais do backend (mesmo hash Argon2id,
 * mesmos repositories) em vez de inserir documentos manualmente — mesmo espírito do
 * `seed-admin.ts` (ADR-004).
 */
import { connectMongo, disconnectMongo } from "../backend/src/database/mongo.client.js";
import { categoryRepository } from "../backend/src/repositories/category.repository.js";
import { userRepository } from "../backend/src/repositories/user.repository.js";
import { hashPassword } from "../backend/src/services/password.service.js";

/** Código de categoria fixo (regex de 003 só aceita letras) — usado pelos specs de 005. */
export const E2E_CATEGORY_CODE = "ETESTE";
export const E2E_CATEGORY_NAME = "Categoria E2E";

export default async function globalSetup(): Promise<void> {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD precisam estar definidos (ver e2e/.env).");
  }

  const db = await connectMongo();

  const existingAdmin = await userRepository.findByEmail(db, email);
  if (!existingAdmin) {
    const passwordHash = await hashPassword(password);
    await userRepository.create(db, {
      name: "E2E Admin",
      email,
      passwordHash,
      role: "admin",
      createdBy: null,
    });
  }

  const existingCategory = await categoryRepository.findByCode(db, E2E_CATEGORY_CODE);
  if (!existingCategory) {
    await categoryRepository.create(db, {
      code: E2E_CATEGORY_CODE,
      name: E2E_CATEGORY_NAME,
      department: "Unissex",
    });
  }

  await disconnectMongo();
}
