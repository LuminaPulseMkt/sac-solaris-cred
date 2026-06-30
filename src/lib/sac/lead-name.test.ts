import { describe, it, expect } from "vitest";
import { resolvePushName, resolveLeadName, shouldUpdateLeadName } from "./lead-name";

describe("resolvePushName", () => {
  it("ignora pushName quando fromMe=true (é nome do operador)", () => {
    expect(resolvePushName(true, "Operador X")).toBeNull();
  });
  it("retorna pushName quando fromMe=false", () => {
    expect(resolvePushName(false, "João da Silva")).toBe("João da Silva");
  });
  it("trim e retorna null para vazio", () => {
    expect(resolvePushName(false, "   ")).toBeNull();
    expect(resolvePushName(false, null)).toBeNull();
    expect(resolvePushName(false, undefined)).toBeNull();
  });
});

describe("resolveLeadName", () => {
  it("usa pushName quando lead manda mensagem", () => {
    expect(
      resolveLeadName({ fromMe: false, pushName: "Maria", leadPhone: "5511999999999" }),
    ).toBe("Maria");
  });
  it("usa telefone quando operador manda primeiro (fromMe=true)", () => {
    expect(
      resolveLeadName({ fromMe: true, pushName: "Operador X", leadPhone: "5511999999999" }),
    ).toBe("5511999999999");
  });
  it("usa telefone quando não há pushName", () => {
    expect(
      resolveLeadName({ fromMe: false, pushName: null, leadPhone: "5511999999999" }),
    ).toBe("5511999999999");
  });
});

describe("shouldUpdateLeadName (backfill)", () => {
  it("atualiza quando lead_name atual é o telefone e chegou pushName real", () => {
    expect(
      shouldUpdateLeadName({
        pushName: "Maria",
        currentLeadName: "5511999999999",
        leadPhone: "5511999999999",
      }),
    ).toBe(true);
  });
  it("atualiza quando lead_name atual é nulo", () => {
    expect(
      shouldUpdateLeadName({
        pushName: "Maria",
        currentLeadName: null,
        leadPhone: "5511999999999",
      }),
    ).toBe(true);
  });
  it("NÃO atualiza quando já existe um nome real", () => {
    expect(
      shouldUpdateLeadName({
        pushName: "Maria",
        currentLeadName: "Maria Antiga",
        leadPhone: "5511999999999",
      }),
    ).toBe(false);
  });
  it("NÃO atualiza sem pushName novo", () => {
    expect(
      shouldUpdateLeadName({
        pushName: null,
        currentLeadName: "5511999999999",
        leadPhone: "5511999999999",
      }),
    ).toBe(false);
  });
});
