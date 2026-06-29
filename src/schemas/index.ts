export {
  platformJsonSchema,
  platformSchema,
  type PlatformSchemaInput,
} from "./platform.js";
export {
  deployConfigJsonSchema,
  deployConfigSchema,
  type DeployConfigSchemaInput,
} from "./deploy-config.js";
export {
  serviceIntentJsonSchema,
  serviceIntentSchema,
  type ServiceIntentSchemaInput,
} from "./service-intent.js";
export {
  fleetInventoryJsonSchema,
  fleetInventorySchema,
  type FleetInventorySchemaInput,
} from "./fleet-inventory.js";
export {
  vaultDynamicSecretsJsonSchema,
  vaultDynamicSecretsSchema,
  type VaultDynamicSecretsSchemaInput,
} from "./vault-dynamic-secrets.js";
export {
  collectionV1JsonSchema,
  collectionV1Schema,
  deploymentEnvV1JsonSchema,
  deploymentEnvV1Schema,
  deploymentLockV1JsonSchema,
  deploymentLockV1Schema,
  deploymentSourcesV1JsonSchema,
  deploymentSourcesV1Schema,
  deploymentV2JsonSchema,
  deploymentV2Schema,
  nodeContractV1JsonSchema,
  nodeContractV1Schema,
  reachabilityV1JsonSchema,
  reachabilityV1Schema,
  stateMovePlanV1JsonSchema,
  stateMovePlanV1Schema,
  type CollectionV1SchemaInput,
  type DeploymentEnvV1SchemaInput,
  type DeploymentLockV1SchemaInput,
  type DeploymentSourcesV1SchemaInput,
  type DeploymentV2SchemaInput,
  type NodeContractV1SchemaInput,
  type ReachabilityV1SchemaInput,
  type StateMovePlanV1SchemaInput,
} from "./deployment-v2.js";

export const generatedSchemaEntries = [
  {
    path: "schemas/platform.schema.json",
    schemaName: "platformSchema",
    jsonSchemaName: "platformJsonSchema",
  },
  {
    path: "schemas/deploy-config.schema.json",
    schemaName: "deployConfigSchema",
    jsonSchemaName: "deployConfigJsonSchema",
  },
  {
    path: "schemas/round3/service-intent.schema.json",
    schemaName: "serviceIntentSchema",
    jsonSchemaName: "serviceIntentJsonSchema",
  },
  {
    path: "schemas/round3/fleet-inventory.schema.json",
    schemaName: "fleetInventorySchema",
    jsonSchemaName: "fleetInventoryJsonSchema",
  },
  {
    path: "schemas/round3/vault-dynamic-secrets.schema.json",
    schemaName: "vaultDynamicSecretsSchema",
    jsonSchemaName: "vaultDynamicSecretsJsonSchema",
  },
  {
    path: "schemas/deployment/v2.schema.json",
    schemaName: "deploymentV2Schema",
    jsonSchemaName: "deploymentV2JsonSchema",
  },
  {
    path: "schemas/deployment-env/v1.schema.json",
    schemaName: "deploymentEnvV1Schema",
    jsonSchemaName: "deploymentEnvV1JsonSchema",
  },
  {
    path: "schemas/deployment-sources/v1.schema.json",
    schemaName: "deploymentSourcesV1Schema",
    jsonSchemaName: "deploymentSourcesV1JsonSchema",
  },
  {
    path: "schemas/deployment-lock/v1.schema.json",
    schemaName: "deploymentLockV1Schema",
    jsonSchemaName: "deploymentLockV1JsonSchema",
  },
  {
    path: "schemas/node-contract/v1.schema.json",
    schemaName: "nodeContractV1Schema",
    jsonSchemaName: "nodeContractV1JsonSchema",
  },
  {
    path: "schemas/collection/v1.schema.json",
    schemaName: "collectionV1Schema",
    jsonSchemaName: "collectionV1JsonSchema",
  },
  {
    path: "schemas/reachability/v1.schema.json",
    schemaName: "reachabilityV1Schema",
    jsonSchemaName: "reachabilityV1JsonSchema",
  },
  {
    path: "schemas/state-move-plan/v1.schema.json",
    schemaName: "stateMovePlanV1Schema",
    jsonSchemaName: "stateMovePlanV1JsonSchema",
  },
] as const;
