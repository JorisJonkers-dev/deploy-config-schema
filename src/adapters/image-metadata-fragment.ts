import { withDeterministicRuntime, type FragmentInput } from "./fragment-model.js";

export type ImageMeta = {
  alias: string;
  ref: string;
  workload: string;
};

export type ImageMetadataFragment = {
  kind: "ImageMetadataFragment";
  images: ImageMeta[];
};

export function renderImageMetadataFragment(input: FragmentInput): ImageMetadataFragment {
  return withDeterministicRuntime(() => {
    const { deployment, images } = input;
    const metadata: ImageMeta[] = [];

    for (const workload of deployment.spec.workloads) {
      const alias = workload.image?.alias ?? workload.name;
      const ref = images[alias];
      if (!ref) {
        throw new Error(`E_IMAGE_ALIAS_NOT_IN_LOCK: alias '${alias}' (workload '${workload.name}') not present in images lock`);
      }
      if (!ref.includes("@sha256:")) {
        throw new Error(`E_FLOATING_IMAGE: alias '${alias}' ref '${ref}' (image-metadata requires digest-pinned refs)`);
      }
      metadata.push({ alias, ref, workload: workload.name });
    }

    return { kind: "ImageMetadataFragment", images: [...metadata].sort((a, b) => a.alias.localeCompare(b.alias)) };
  });
}
