import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

const sampleSchema = z.object({
  name: z.string().min(1),
});

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(sampleSchema);

  it("returns parsed data", () => {
    expect(pipe.transform({ name: "MedStock" })).toEqual({ name: "MedStock" });
  });

  it("rejects invalid data", () => {
    expect(() => pipe.transform({ name: "" })).toThrow(BadRequestException);
  });
});
