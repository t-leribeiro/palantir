// SeaweedFS real em container para testes de integração da mídia (feature 005), com a mesma imagem e
// a mesma configuração S3 do ambiente local (infra/modules/object-storage).
import { randomBytes } from "node:crypto";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";

export const SEAWEEDFS_IMAGE = "chrislusf/seaweedfs:4.52";

export interface TestObjectStorage {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
  stop(): Promise<void>;
}

export async function startTestObjectStorage(): Promise<TestObjectStorage> {
  // Credenciais descartáveis, geradas a cada execução (nada fixo no repositório).
  const accessKey = `test${randomBytes(6).toString("hex")}`;
  const secretKey = randomBytes(20).toString("hex");
  const config = JSON.stringify({
    identities: [{ name: "palantir", credentials: [{ accessKey, secretKey }], actions: ["Admin", "Read", "Write", "List", "Tagging"] }],
  });
  const container: StartedTestContainer = await new GenericContainer(SEAWEEDFS_IMAGE)
    .withCommand(["server", "-dir=/data", "-s3", "-s3.port=8333", "-s3.config=/etc/seaweedfs/s3.json"])
    .withCopyContentToContainer([{ content: config, target: "/etc/seaweedfs/s3.json" }])
    .withExposedPorts(8333)
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(120_000)
    .start();
  return {
    endpoint: `http://${container.getHost()}:${container.getMappedPort(8333)}`,
    bucket: "palantir-media-test",
    accessKey,
    secretKey,
    stop: async () => {
      await container.stop();
    },
  };
}
