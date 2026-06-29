import { jsonSchemaBackedZodSchema } from "./support.js";

const identifier = {
  type: "string",
  pattern: "^[a-z0-9][a-z0-9._-]*$",
};

const envKeyIdentifier = {
  type: "string",
  pattern: "^[A-Za-z0-9._-]+$",
};

const nonEmptyString = {
  type: "string",
  minLength: 1,
};

const stringMap = {
  type: "object",
  additionalProperties: { type: "string" },
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

const relativePath = {
  type: "string",
  minLength: 1,
  not: { pattern: "^/" },
};

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

const port = {
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
    servicePort: {
      type: "integer",
      minimum: 1,
      maximum: 65535,
    },
    protocol: {
      enum: ["TCP", "UDP"],
      default: "TCP",
    },
  },
};

const container = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: identifier,
    image: imageRef,
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
      items: port,
    },
    env: stringMap,
    envFromSecrets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: identifier,
          optional: { type: "boolean" },
        },
      },
    },
    resources: {
      type: "object",
      additionalProperties: true,
    },
    volumeMounts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["volume", "path"],
        properties: {
          volume: identifier,
          path: { type: "string", pattern: "^/" },
          readOnly: { type: "boolean" },
        },
      },
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
  },
};

const credential = {
  type: "object",
  additionalProperties: false,
  required: ["name", "claim"],
  properties: {
    name: identifier,
    claim: nonEmptyString,
    provider: {
      enum: ["vault-kv", "postgres", "mariadb", "rabbitmq", "external"],
    },
    destinationSecret: identifier,
    namespace: identifier,
    rotation: {
      type: "object",
      additionalProperties: false,
      properties: {
        refreshAfter: nonEmptyString,
        renewalPercent: {
          type: "integer",
          minimum: 1,
          maximum: 100,
        },
      },
    },
  },
};

const storageVolume = {
  type: "object",
  additionalProperties: false,
  required: ["name", "kind"],
  properties: {
    name: identifier,
    kind: {
      enum: ["persistent", "host_path", "empty_dir", "config_map", "secret"],
    },
    size: nonEmptyString,
    accessModes: {
      type: "array",
      uniqueItems: true,
      items: nonEmptyString,
    },
    storageClassName: nonEmptyString,
    tier: identifier,
    hostPath: { type: "string", pattern: "^/" },
    statefulTemplate: { type: "boolean" },
  },
};

const deploymentWorkload = {
  type: "object",
  additionalProperties: false,
  required: ["image"],
  properties: {
    group: identifier,
    kind: {
      enum: ["deployment", "statefulset", "job", "cronjob", "external_service", "host_native", "nomad_job"],
    },
    namespace: identifier,
    replicas: {
      type: "integer",
      minimum: 0,
    },
    schedule: nonEmptyString,
    restartPolicy: nonEmptyString,
    serviceAccountName: identifier,
    account: identifier,
    image: imageRef,
    pullPolicy: {
      enum: ["Always", "IfNotPresent", "Never"],
    },
    pullSecrets: {
      type: "array",
      uniqueItems: true,
      items: identifier,
    },
    updateEligible: { type: "boolean" },
    containers: {
      type: "array",
      minItems: 1,
      items: container,
    },
    initContainers: {
      type: "array",
      items: container,
    },
    sidecars: {
      type: "array",
      items: container,
    },
    ports: {
      type: "array",
      uniqueItems: true,
      items: port,
    },
    command: {
      type: "array",
      items: nonEmptyString,
    },
    args: {
      type: "array",
      items: nonEmptyString,
    },
    env: stringMap,
    data: {
      type: "object",
      additionalProperties: true,
    },
    messaging: {
      type: "object",
      additionalProperties: true,
    },
    config: {
      type: "object",
      additionalProperties: false,
      properties: {
        values: stringMap,
        files: stringMap,
      },
    },
    secrets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "destinationSecretName"],
        properties: {
          name: identifier,
          destinationSecretName: identifier,
          envKeys: {
            type: "array",
            uniqueItems: true,
            items: envKeyIdentifier,
          },
        },
      },
    },
    storage: {
      type: "object",
      additionalProperties: false,
      properties: {
        volumes: {
          type: "array",
          items: storageVolume,
        },
        mounts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["volume", "path"],
            properties: {
              volume: identifier,
              path: { type: "string", pattern: "^/" },
              readOnly: { type: "boolean" },
            },
          },
        },
        tiers: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            required: ["storageClassName"],
            properties: {
              storageClassName: nonEmptyString,
            },
          },
        },
      },
    },
    placement: {
      type: "object",
      additionalProperties: false,
      properties: {
        nodeName: identifier,
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
        gpu: {
          type: "object",
          additionalProperties: false,
          properties: {
            count: {
              type: "integer",
              minimum: 1,
              default: 1,
            },
            vendor: identifier,
            model: identifier,
            class: identifier,
            minMemoryMiB: {
              type: "integer",
              minimum: 1,
            },
            resourceName: nonEmptyString,
          },
        },
        tolerations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        topologySpread: {
          type: "array",
          uniqueItems: true,
          items: nonEmptyString,
        },
      },
    },
    autoscaling: {
      type: "object",
      additionalProperties: false,
      required: ["maxReplicas"],
      properties: {
        minReplicas: {
          type: "integer",
          minimum: 0,
        },
        maxReplicas: {
          type: "integer",
          minimum: 1,
        },
        targetCpuUtilization: {
          type: "integer",
          minimum: 1,
          maximum: 100,
        },
        targetMemoryUtilization: {
          type: "integer",
          minimum: 1,
          maximum: 100,
        },
        keda: {
          type: "object",
          additionalProperties: false,
          required: ["triggers"],
          properties: {
            triggers: {
              type: "array",
              items: { type: "object", additionalProperties: true },
            },
          },
        },
      },
    },
    credentials: {
      type: "array",
      uniqueItems: true,
      items: credential,
    },
    observability: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "url"],
            properties: {
              name: identifier,
              group: identifier,
              url: nonEmptyString,
              type: { enum: ["http", "tcp"] },
              interval: nonEmptyString,
              conditions: {
                type: "array",
                items: nonEmptyString,
              },
              strategy: { enum: ["internal", "external", "both"] },
            },
          },
        },
        metrics: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["port"],
            properties: {
              kind: { enum: ["ServiceMonitor", "PodMonitor"] },
              port: identifier,
              path: {
                type: "string",
                pattern: "^/",
              },
              interval: nonEmptyString,
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
        required: ["host", "expose", "auth", "rules"],
        properties: {
          name: identifier,
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
          auth: {
            type: "object",
            additionalProperties: false,
            required: ["scope"],
            properties: {
              scope: {
                enum: ["anonymous", "application", "user"],
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
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name"],
            properties: {
              name: identifier,
              image: imageRef,
              command: {
                type: "array",
                items: nonEmptyString,
              },
              args: {
                type: "array",
                items: nonEmptyString,
              },
              env: stringMap,
            },
          },
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
    rawManifests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
      },
    },
  },
};

export const deploymentJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/deployment.schema.json",
  title: "JorisJonkers-dev Deployment",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "spec"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev"),
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
      required: ["workloads"],
      properties: {
        workloads: objectMap(deploymentWorkload, 1),
        data: {
          type: "object",
          additionalProperties: true,
        },
        messaging: {
          type: "object",
          additionalProperties: true,
        },
        fragments: {
          type: "array",
          uniqueItems: true,
          items: nonEmptyString,
        },
        parityImports: {
          type: "object",
          additionalProperties: false,
          properties: {
            existingFiles: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["path", "content"],
                properties: {
                  path: relativePath,
                  content: { type: "string" },
                  adapter: nonEmptyString,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const deploymentEnvJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/deployment-env.schema.json",
  title: "JorisJonkers-dev Deployment Environment",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "spec"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/env"),
    kind: {
      const: "DeploymentEnvironment",
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: {
          enum: ["runtime", "development", "staging", "production"],
        },
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

export const deploymentSourcesJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/deployment-sources.schema.json",
  title: "JorisJonkers-dev Deployment Sources",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "spec"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/sources"),
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
          items: {
            enum: ["runtime", "development", "staging", "production"],
          },
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

export const deploymentLockJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/deployment-lock.schema.json",
  title: "JorisJonkers-dev Deployment Lock",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "inputs"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/lock"),
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

const inventoryReference = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    path: relativePath,
  },
};

const nodeInventoryDocument = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "metadata",
    "status",
    "site",
    "arch",
    "roles",
    "capacity",
    "gpus",
    "capabilities",
    "labels",
    "taints",
    "schedulability",
    "storage",
  ],
  properties: {
    kind: { const: "NodeInventory" },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: identifier,
      },
    },
    status: { enum: ["active", "install-ready", "planned", "ignored", "retired"] },
    site: identifier,
    arch: { enum: ["amd64", "arm64"] },
    ssh: {
      type: "object",
      additionalProperties: false,
      required: ["host", "user", "port"],
      properties: {
        host: nonEmptyString,
        user: nonEmptyString,
        port: { type: "integer", minimum: 1, maximum: 65535 },
      },
    },
    roles: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: identifier,
    },
    capacity: {
      type: "object",
      additionalProperties: false,
      required: ["cpu_millicores", "memory_mib"],
      properties: {
        cpu_millicores: { type: "integer", minimum: 1 },
        memory_mib: { type: "integer", minimum: 1 },
      },
    },
    gpus: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["vendor", "model", "class", "memory_mib", "count"],
        properties: {
          vendor: identifier,
          model: identifier,
          class: identifier,
          memory_mib: { type: "integer", minimum: 1 },
          count: { type: "integer", minimum: 1 },
          resource_name: nonEmptyString,
        },
      },
    },
    capabilities: {
      type: "array",
      uniqueItems: true,
      items: identifier,
    },
    labels: {
      type: "object",
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
          value: { type: "string" },
          effect: { enum: ["NoSchedule", "PreferNoSchedule", "NoExecute"] },
        },
      },
    },
    schedulability: {
      type: "object",
      additionalProperties: false,
      required: ["enabled", "reason"],
      properties: {
        enabled: { type: "boolean" },
        reason: nonEmptyString,
      },
    },
    storage: {
      type: "object",
      additionalProperties: false,
      required: ["longhorn", "disks"],
      properties: {
        longhorn: {
          type: "object",
          additionalProperties: false,
          required: ["eligible"],
          properties: {
            eligible: { type: "boolean" },
            role: identifier,
            node_tags: {
              type: "array",
              uniqueItems: true,
              items: identifier,
            },
            reason: nonEmptyString,
          },
        },
        disks: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "path", "media", "usable_gib", "reserved_gib", "roles", "longhorn"],
            properties: {
              name: identifier,
              path: { type: "string", pattern: "^/" },
              media: { enum: ["nvme", "ssd", "hdd", "sdcard"] },
              usable_gib: { type: "integer", minimum: 1 },
              reserved_gib: { type: "integer", minimum: 0 },
              roles: {
                type: "array",
                minItems: 1,
                uniqueItems: true,
                items: identifier,
              },
              longhorn: {
                type: "object",
                additionalProperties: false,
                required: ["enabled"],
                properties: {
                  enabled: { type: "boolean" },
                  allow_scheduling: { type: "boolean" },
                  disk_type: { enum: ["filesystem", "block"] },
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
};

export const nodeInventoryJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/node-inventory.schema.json",
  title: "Node Inventory",
  ...nodeInventoryDocument,
} as const;

export const hostInventoryJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/host-inventory.schema.json",
  title: "Host Inventory Documents",
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "metadata", "sites", "nodes"],
      properties: {
        kind: { const: "FleetInventory" },
        metadata: {
          type: "object",
          additionalProperties: true,
        },
        sites: {
          type: "array",
          items: inventoryReference,
        },
        nodes: {
          type: "array",
          items: inventoryReference,
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "metadata", "site"],
      properties: {
        kind: { const: "SiteInventory" },
        metadata: {
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: {
            name: identifier,
          },
        },
        site: {
          type: "object",
          additionalProperties: true,
          required: ["kind", "purpose"],
          properties: {
            kind: identifier,
            purpose: identifier,
            region: identifier,
            labels: {
              type: "object",
              additionalProperties: nonEmptyString,
            },
          },
        },
      },
    },
    nodeInventoryDocument,
  ],
} as const;

export const nodeContractJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/node-contract.schema.json",
  title: "JorisJonkers-dev Node Contract",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "nodes"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/node-contract"),
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
      required: ["status", "schedulable", "site", "arch", "capacity", "labels", "gpus", "storage"],
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
        capacity: {
          type: "object",
          additionalProperties: false,
          required: ["memoryMiB"],
          properties: {
            cpuMillicores: {
              type: "integer",
              minimum: 1,
            },
            memoryMiB: {
              type: "integer",
              minimum: 1,
            },
          },
        },
        labels: {
          type: "object",
          required: ["kubernetes.io/arch"],
          additionalProperties: nonEmptyString,
        },
        annotations: {
          type: "object",
          additionalProperties: { type: "string" },
        },
        roles: {
          type: "array",
          uniqueItems: true,
          items: identifier,
        },
        capabilities: {
          type: "array",
          uniqueItems: true,
          items: identifier,
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
        gpus: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["vendor", "model", "class", "memoryMiB", "count"],
            properties: {
              vendor: identifier,
              model: identifier,
              class: identifier,
              memoryMiB: {
                type: "integer",
                minimum: 1,
              },
              count: {
                type: "integer",
                minimum: 1,
              },
              resourceName: nonEmptyString,
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
                      media: { enum: ["nvme", "ssd", "hdd", "sdcard"] },
                      usableGiB: {
                        type: "integer",
                        minimum: 1,
                      },
                      reservedGiB: {
                        type: "integer",
                        minimum: 0,
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
        observed: {
          type: "object",
          additionalProperties: true,
        },
      },
    }, 1),
  },
} as const;

export const collectionJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/collection.schema.json",
  title: "JorisJonkers-dev Collection",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "spec"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/collection"),
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
          items: deploymentJsonSchema,
        },
        providerExports: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: true,
            required: ["type"],
            properties: {
              name: identifier,
              type: { enum: ["database", "messaging", "kv", "external"] },
              namespace: identifier,
              endpoint: {
                type: "object",
                additionalProperties: false,
                required: ["service", "port"],
                properties: {
                  service: identifier,
                  port: {
                    anyOf: [{ type: "integer" }, nonEmptyString],
                  },
                },
              },
              grants: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
        },
      },
    },
  },
} as const;

export const collectionIndexJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/collection-index.schema.json",
  title: "Collection Index",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "collections"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/collection-index"),
    kind: { const: "CollectionIndex" },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["root", "generatedAt"],
      properties: {
        root: nonEmptyString,
        generatedAt: nonEmptyString,
      },
    },
    collections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "path", "digest"],
        properties: {
          name: identifier,
          path: relativePath,
          digest,
          env: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "path", "digest"],
              properties: {
                name: identifier,
                path: relativePath,
                digest,
              },
            },
          },
        },
      },
    },
  },
} as const;

export const reachabilityJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/reachability.schema.json",
  title: "JorisJonkers-dev Reachability",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "channels"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/reachability"),
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

export const stateMovePlanJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.jorisjonkers.dev/state-move-plan.schema.json",
  title: "JorisJonkers-dev State Move Plan",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "kind", "metadata", "moves"],
  properties: {
    apiVersion: apiVersion("deployment.jorisjonkers.dev/state-move-plan"),
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

export const deploymentSchema = jsonSchemaBackedZodSchema(deploymentJsonSchema);
export const deploymentEnvSchema = jsonSchemaBackedZodSchema(deploymentEnvJsonSchema);
export const deploymentSourcesSchema = jsonSchemaBackedZodSchema(deploymentSourcesJsonSchema);
export const deploymentLockSchema = jsonSchemaBackedZodSchema(deploymentLockJsonSchema);
export const hostInventorySchema = jsonSchemaBackedZodSchema(hostInventoryJsonSchema);
export const nodeInventorySchema = jsonSchemaBackedZodSchema(nodeInventoryJsonSchema);
export const nodeContractSchema = jsonSchemaBackedZodSchema(nodeContractJsonSchema);
export const collectionSchema = jsonSchemaBackedZodSchema(collectionJsonSchema);
export const collectionIndexSchema = jsonSchemaBackedZodSchema(collectionIndexJsonSchema);
export const reachabilitySchema = jsonSchemaBackedZodSchema(reachabilityJsonSchema);
export const stateMovePlanSchema = jsonSchemaBackedZodSchema(stateMovePlanJsonSchema);

export type DeploymentSchemaInput = unknown;
export type DeploymentEnvSchemaInput = unknown;
export type DeploymentSourcesSchemaInput = unknown;
export type DeploymentLockSchemaInput = unknown;
export type HostInventorySchemaInput = unknown;
export type NodeInventorySchemaInput = unknown;
export type NodeContractSchemaInput = unknown;
export type CollectionSchemaInput = unknown;
export type CollectionIndexSchemaInput = unknown;
export type ReachabilitySchemaInput = unknown;
export type StateMovePlanSchemaInput = unknown;
