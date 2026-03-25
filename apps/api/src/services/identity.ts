import { z } from "zod";

const ServiceIdentitySchema = z.object({
  projectId: z.string().min(1),
  serviceName: z.string().min(1),
});

export type ServiceIdentity = z.infer<typeof ServiceIdentitySchema>;

export const createServiceId = (input: ServiceIdentity): string => {
  return Buffer.from(
    JSON.stringify(ServiceIdentitySchema.parse(input)),
  ).toString("base64url");
};

export const parseServiceId = (serviceId: string): ServiceIdentity | null => {
  if (serviceId.length === 0) {
    return null;
  }

  try {
    const decoded = Buffer.from(serviceId, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    const result = ServiceIdentitySchema.safeParse(parsed);

    return result.success ? result.data : null;
  } catch {
    return null;
  }
};
