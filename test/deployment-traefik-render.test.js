import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "yaml";
import { renderTraefik } from "../src/deployment/render/traefik.js";

function docs(file) {
  return YAML.parseAllDocuments(file.content).map((document) => document.toJSON());
}

function model(overrides = {}) {
  return {
    renderMode: "parity",
    cluster: { appsRoot: "apps", publicDomain: "example.net" },
    workloads: {
      web: {
        name: "web",
        namespace: "apps",
        service: {
          name: "web",
          ports: [{ name: "http", containerPort: 8080, servicePort: 80, protocol: "TCP" }],
        },
      },
      media: {
        name: "media",
        namespace: "media",
        service: {
          name: "jellyfin",
          ports: [{ name: "http", containerPort: 8096, servicePort: 8096, protocol: "TCP" }],
        },
      },
    },
    routes: [
      {
        name: "web",
        serviceName: "web",
        host: "app.example.net",
        tier: "public-frankfurt",
        authScope: "application",
        rules: [{ path: "/", operation: "prefix", port: "http", priority: 100, middleware: ["web-root-redirect"] }],
      },
      {
        name: "media",
        serviceName: "media",
        host: "media.example.net",
        tier: "lan",
        authScope: "anonymous",
        rules: [{ path: "/stream/[0-9]+", operation: "regexp", port: "http", middleware: [] }],
      },
    ],
    adapterArtifacts: {
      "deploy-config": {
        ingress_intent: {
          defaults: {
            namespace: "edge",
            public_ingress_class: "traefik-public",
            lan_ingress_class: "traefik-lan",
            entrypoint: "websecure",
            tls: true,
            sso_middleware: "forward-auth",
          },
        },
      },
    },
    ...overrides,
  };
}

test("deployment Traefik renders public and LAN IngressRoute files", () => {
  const result = renderTraefik(model());
  assert.deepEqual(result.files.map((file) => file.path), [
    "apps/edge/traefik-ingressroutes.yaml",
    "apps/edge/traefik-lan-ingressroutes.yaml",
  ]);

  const publicRoute = docs(result.files[0])[0];
  assert.equal(publicRoute.metadata.name, "web");
  assert.equal(publicRoute.metadata.namespace, "edge");
  assert.equal(publicRoute.metadata.annotations["kubernetes.io/ingress.class"], "traefik-public");
  assert.equal(publicRoute.metadata.annotations["external-dns.alpha.kubernetes.io/target"], "ingress.example.net");
  assert.equal(publicRoute.spec.entryPoints[0], "websecure");
  assert.equal(publicRoute.spec.routes[0].match, "Host(`app.example.net`) && PathPrefix(`/`)");
  assert.deepEqual(publicRoute.spec.routes[0].middlewares.map((middleware) => middleware.name), ["web-root-redirect", "forward-auth"]);
  assert.deepEqual(publicRoute.spec.routes[0].services[0], { name: "web", namespace: "apps", port: 80 });
  assert.equal("priority" in publicRoute.spec.routes[0], false);
  assert.deepEqual(publicRoute.spec.tls, {});

  const lanRoute = docs(result.files[1])[0];
  assert.equal(lanRoute.metadata.name, "media-lan");
  assert.equal(lanRoute.metadata.annotations["kubernetes.io/ingress.class"], "traefik-lan");
  assert.equal(lanRoute.metadata.annotations["external-dns.alpha.kubernetes.io/target"], undefined);
  assert.equal(lanRoute.spec.routes[0].match, "Host(`media.example.net`) && PathRegexp(`/stream/[0-9]+`)");
  assert.equal(lanRoute.spec.routes[0].middlewares, undefined);
});

test("deployment Traefik includes rule priority only in native render mode", () => {
  const result = renderTraefik(model({ renderMode: "native" }));
  const publicRoute = docs(result.files[0])[0];
  assert.equal(publicRoute.spec.routes[0].priority, 100);
});
