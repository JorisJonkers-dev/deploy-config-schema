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
  collectionJsonSchema,
  collectionIndexJsonSchema,
  collectionIndexSchema,
  collectionSchema,
  deploymentEnvJsonSchema,
  deploymentEnvSchema,
  deploymentLockJsonSchema,
  deploymentLockSchema,
  deploymentSourcesJsonSchema,
  deploymentSourcesSchema,
  deploymentJsonSchema,
  deploymentSchema,
  hostInventoryJsonSchema,
  hostInventorySchema,
  nodeInventoryJsonSchema,
  nodeInventorySchema,
  nodeContractJsonSchema,
  nodeContractSchema,
  reachabilityJsonSchema,
  reachabilitySchema,
  stateMovePlanJsonSchema,
  stateMovePlanSchema,
  type CollectionIndexSchemaInput,
  type CollectionSchemaInput,
  type DeploymentEnvSchemaInput,
  type DeploymentLockSchemaInput,
  type DeploymentSourcesSchemaInput,
  type DeploymentSchemaInput,
  type HostInventorySchemaInput,
  type NodeInventorySchemaInput,
  type NodeContractSchemaInput,
  type ReachabilitySchemaInput,
  type StateMovePlanSchemaInput,
} from "./deployment.js";

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
    path: "schemas/deployment.schema.json",
    schemaName: "deploymentSchema",
    jsonSchemaName: "deploymentJsonSchema",
  },
  {
    path: "schemas/deployment-env.schema.json",
    schemaName: "deploymentEnvSchema",
    jsonSchemaName: "deploymentEnvJsonSchema",
  },
  {
    path: "schemas/deployment-sources.schema.json",
    schemaName: "deploymentSourcesSchema",
    jsonSchemaName: "deploymentSourcesJsonSchema",
  },
  {
    path: "schemas/deployment-lock.schema.json",
    schemaName: "deploymentLockSchema",
    jsonSchemaName: "deploymentLockJsonSchema",
  },
  {
    path: "schemas/host-inventory.schema.json",
    schemaName: "hostInventorySchema",
    jsonSchemaName: "hostInventoryJsonSchema",
  },
  {
    path: "schemas/node-inventory.schema.json",
    schemaName: "nodeInventorySchema",
    jsonSchemaName: "nodeInventoryJsonSchema",
  },
  {
    path: "schemas/node-contract.schema.json",
    schemaName: "nodeContractSchema",
    jsonSchemaName: "nodeContractJsonSchema",
  },
  {
    path: "schemas/collection.schema.json",
    schemaName: "collectionSchema",
    jsonSchemaName: "collectionJsonSchema",
  },
  {
    path: "schemas/collection-index.schema.json",
    schemaName: "collectionIndexSchema",
    jsonSchemaName: "collectionIndexJsonSchema",
  },
  {
    path: "schemas/reachability.schema.json",
    schemaName: "reachabilitySchema",
    jsonSchemaName: "reachabilityJsonSchema",
  },
  {
    path: "schemas/state-move-plan.schema.json",
    schemaName: "stateMovePlanSchema",
    jsonSchemaName: "stateMovePlanJsonSchema",
  },
] as const;
