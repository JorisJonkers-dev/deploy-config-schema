import { jsonSchemaBackedZodSchema } from "./support.js";

const identifier = {
  type: "string",
  pattern: "^[a-z0-9][a-z0-9._-]*$",
};

const nonEmptyString = {
  type: "string",
  minLength: 1,
};

const apiVersion = (value: string) => ({
  const: value,
});

const objectMap = (valueSchema: Record<string, unknown>, minProperties = 0) => ({
  type: "object",
  minProperties,
  propertyNames: identifier,
  additionalProperties: valueSchema,
});

const imageRef = {
  type: "string",
  pattern: "^[^\\s]+@sha256:[a-f0-9]{64}$|^[^\\s]+:[^\\s]+$",
};

const digest = {
  type: "string",
  pattern: "^sha256:[a-f0-9]{64}$",
};

const gitRef = {
  type: "object",
  additionalProperties: false,
  required: ["repo", "ref"],
  properties: {
    repo: nonEmptyString,
    ref: nonEmptyString,
    sha: {
      type: "string",
      pattern: "^[a-f0-9]{40}$",
    },
    paths: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: nonEmptyString,
    },
  },
};

const routeRule = {
  type: "object",
  additionalProperties: false,
  required: ["path", "port"],
  properties: {
    path: {
      type: "string",
      pattern: "^/",
    },
    port: nonEmptyString,
    operation: {
      enum: ["prefix", "exact", "regexp"],
      default: "prefix",
    },
    priority: {
      type: "integer",
      minimum: 0,
    },
    middleware: {
      type: "array",
      uniqueItems: true,
      items: nonEmptyString,
    },
    auth: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope: {
          enum: ["anonymous", "authenticated", "admin"],
        },
      },
    },
  },
};

const deploymentService = {
  type: "object",
  additionalProperties: false,
  required: ["image"],
  properties: {
    image: imageRef,
    namespace: identifier,
    account: identifier,
    command: {
      type: "array",
      items: nonEmptyString,
    },
    args: {
      type: "array",
      items: nonEmptyString,
    },
    ports: {
      type: "array",
      uniqueItems: true,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "containerPort"],
        properties: {
          name: identifier,
          containerPort: {
            type: "integer",
            minimum: 1,
            maximum: 65535,
          },
          protocol: {
            enum: ["TCP", "UDP"],
            default: "TCP",
          },
        },
      },
    },
    data: {
      type: "object",
      additionalProperties: true,
    },
    messaging: {
      type: "object",
      additionalProperties: true,
    },
    placement: {
      type: "object",
      additionalProperties: false,
      properties: {
        site: identifier,
        nodeSelector: {
          type: "object",
          additionalProperties: nonEmptyString,
        },
        requiredCapabilities: {
          type: "array",
          uniqueItems: true,
          items: identifier,
        },
      },
    },
    autoscaling: {
      type: "object",
      additionalProperties: false,
      properties: {
        minReplicas: {
          type: "integer",
          minimum: 0,
        },
        maxReplicas: {
          type: "integer",
          minimum: 1,
        },
      },
    },
    credentials: {
      type: "array",
      uniqueItems: true,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "claim"],
        properties: {
          name: identifier,
          claim: nonEmptyString,
          destinationSecret: identifier,
        },
      },
    },
    observability: {
      type: "object",
      additionalProperties: false,
      properties: {
        metrics: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["port"],
            properties: {
              port: identifier,
              path: {
                type: "string",
                pattern: "^/",
              },
            },
          },
        },
        gatus: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "url"],
            properties: {
              name: identifier,
              url: nonEmptyString,
            },
          },
        },
      },
    },
    routes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["host", "expose", "rules"],
        properties: {
          host: nonEmptyString,
          expose: {
            type: "object",
            additionalProperties: false,
            required: ["tier"],
            properties: {
              tier: {
                enum: ["lan", "public-frankfurt"],
              },
            },
          },
          rules: {
            type: "array",
            minItems: 1,
            items: routeRule,
          },
        },
      },
    },
    hooks: {
      type: "object",
      additionalProperties: false,
      properties: {
        pre: {
          type: "array",
          items: nonEmptyString,
        },
      },
    },
    safety: {
      type: "object",
      additionalProperties: false,
      properties: {
        gateOn: {
          type: "array",
          uniqueItems: true,
          items: nonEmptyString,
        },
      },
    },
  },
};

export const deploymentV2JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/deployment/v2.schema.json",
  title: "JorisJonkers-dev Deployment v2",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "spec"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/v2"),
    kind: {
      const: "Deployment",
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: identifier,
        labels: {
          type: "object",
          additionalProperties: nonEmptyString,
        },
      },
    },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["services"],
      properties: {
        services: objectMap(deploymentService, 1),
        fragments: {
          type: "array",
          uniqueItems: true,
          items: nonEmptyString,
        },
      },
    },
  },
} as const;

export const deploymentEnvV1JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/deployment-env/v1.schema.json",
  title: "JorisJonkers-dev Deployment Environment v1",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "spec"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/env/v1"),
    kind: {
      const: "DeploymentEnvironment",
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: identifier,
      },
    },
    spec: {
      type: "object",
      additionalProperties: false,
      properties: {
        values: {
          type: "object",
          additionalProperties: true,
        },
        overrides: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
} as const;

export const deploymentSourcesV1JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/deployment-sources/v1.schema.json",
  title: "JorisJonkers-dev Deployment Sources v1",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "spec"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/sources/v1"),
    kind: {
      const: "DeploymentSources",
    },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["environments"],
      properties: {
        environments: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: identifier,
        },
        firstParty: objectMap({
          type: "object",
          additionalProperties: false,
          required: ["bundle"],
          properties: {
            bundle: nonEmptyString,
            repo: nonEmptyString,
            policy: {
              enum: ["locked", "release"],
            },
          },
        }),
        collections: objectMap(gitRef),
        hosts: gitRef,
        platformBlueprints: gitRef,
        policies: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
} as const;

export const deploymentLockV1JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/deployment-lock/v1.schema.json",
  title: "JorisJonkers-dev Deployment Lock v1",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "inputs"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/lock/v1"),
    kind: {
      const: "DeploymentLock",
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["generatedAt"],
      properties: {
        generatedAt: nonEmptyString,
        renderedRootDigest: digest,
      },
    },
    inputs: {
      type: "object",
      additionalProperties: false,
      properties: {
        firstParty: objectMap({
          type: "object",
          additionalProperties: false,
          required: ["bundle", "manifestDigest", "repoSha", "images"],
          properties: {
            bundle: nonEmptyString,
            manifestDigest: digest,
            repoSha: {
              type: "string",
              pattern: "^[a-f0-9]{40}$",
            },
            images: {
              type: "array",
              uniqueItems: true,
              items: imageRef,
            },
          },
        }),
        collections: objectMap(gitRef),
        homelabHosts: gitRef,
        platformBlueprints: gitRef,
        charts: objectMap({
          type: "object",
          additionalProperties: false,
          required: ["version", "digest"],
          properties: {
            version: nonEmptyString,
            digest,
          },
        }),
        images: objectMap(imageRef),
      },
    },
  },
} as const;

export const nodeContractV1JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/node-contract/v1.schema.json",
  title: "JorisJonkers-dev Node Contract v1",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "nodes"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/node-contract/v1"),
    kind: {
      const: "NodeContract",
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["sourceSha"],
      properties: {
        sourceSha: {
          type: "string",
          pattern: "^[a-f0-9]{40}$",
        },
      },
    },
    nodes: objectMap({
      type: "object",
      additionalProperties: false,
      required: ["status", "schedulable", "site", "arch", "labels", "storage"],
      properties: {
        status: {
          enum: ["active", "ignored", "planned", "retired"],
        },
        schedulable: {
          type: "boolean",
        },
        site: identifier,
        arch: {
          enum: ["amd64", "arm64"],
        },
        labels: {
          type: "object",
          required: [
            "platform.jorisjonkers.dev/site",
            "platform.jorisjonkers.dev/node-id",
            "kubernetes.io/arch",
          ],
          additionalProperties: nonEmptyString,
        },
        taints: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "effect"],
            properties: {
              key: nonEmptyString,
              value: nonEmptyString,
              effect: {
                enum: ["NoSchedule", "PreferNoSchedule", "NoExecute"],
              },
            },
          },
        },
        storage: {
          type: "object",
          additionalProperties: false,
          required: ["longhorn"],
          properties: {
            longhorn: {
              type: "object",
              additionalProperties: false,
              required: ["eligible", "nodeTags", "disks"],
              properties: {
                eligible: {
                  type: "boolean",
                },
                nodeTags: {
                  type: "array",
                  uniqueItems: true,
                  items: identifier,
                },
                disks: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "path", "tags"],
                    properties: {
                      name: identifier,
                      path: {
                        type: "string",
                        pattern: "^/",
                      },
                      tags: {
                        type: "array",
                        uniqueItems: true,
                        items: identifier,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }, 1),
  },
} as const;

export const collectionV1JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/collection/v1.schema.json",
  title: "JorisJonkers-dev Collection v1",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "spec"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/collection/v1"),
    kind: {
      const: "Collection",
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: identifier,
        domain: identifier,
      },
    },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["deployments"],
      properties: {
        deployments: {
          type: "array",
          minItems: 1,
          items: deploymentV2JsonSchema,
        },
        providerExports: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
} as const;

export const reachabilityV1JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/reachability/v1.schema.json",
  title: "JorisJonkers-dev Reachability v1",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "channels"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/reachability/v1"),
    kind: {
      const: "Reachability",
    },
    channels: {
      type: "object",
      required: ["public-frankfurt", "lan"],
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["hosts"],
        properties: {
          hosts: {
            type: "array",
            uniqueItems: true,
            items: nonEmptyString,
          },
          auth: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    },
  },
} as const;

export const stateMovePlanV1JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/state-move-plan/v1.schema.json",
  title: "JorisJonkers-dev State Move Plan v1",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "moves"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/state-move-plan/v1"),
    kind: {
      const: "StateMovePlan",
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["name", "ownerApproved"],
      properties: {
        name: identifier,
        ownerApproved: {
          type: "boolean",
        },
      },
    },
    moves: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["resource", "from", "to", "operation"],
        properties: {
          resource: nonEmptyString,
          from: nonEmptyString,
          to: nonEmptyString,
          operation: {
            enum: ["copy", "move", "adopt"],
          },
          safety: {
            type: "object",
            additionalProperties: false,
            properties: {
              gateOn: {
                type: "array",
                uniqueItems: true,
                items: nonEmptyString,
              },
            },
          },
        },
      },
    },
  },
} as const;

export const deploymentV2Schema = jsonSchemaBackedZodSchema(deploymentV2JsonSchema);
export const deploymentEnvV1Schema = jsonSchemaBackedZodSchema(deploymentEnvV1JsonSchema);
export const deploymentSourcesV1Schema = jsonSchemaBackedZodSchema(deploymentSourcesV1JsonSchema);
export const deploymentLockV1Schema = jsonSchemaBackedZodSchema(deploymentLockV1JsonSchema);
export const nodeContractV1Schema = jsonSchemaBackedZodSchema(nodeContractV1JsonSchema);
export const collectionV1Schema = jsonSchemaBackedZodSchema(collectionV1JsonSchema);
export const reachabilityV1Schema = jsonSchemaBackedZodSchema(reachabilityV1JsonSchema);
export const stateMovePlanV1Schema = jsonSchemaBackedZodSchema(stateMovePlanV1JsonSchema);

export type DeploymentV2SchemaInput = unknown;
export type DeploymentEnvV1SchemaInput = unknown;
export type DeploymentSourcesV1SchemaInput = unknown;
export type DeploymentLockV1SchemaInput = unknown;
export type NodeContractV1SchemaInput = unknown;
export type CollectionV1SchemaInput = unknown;
export type ReachabilityV1SchemaInput = unknown;
export type StateMovePlanV1SchemaInput = unknown;
