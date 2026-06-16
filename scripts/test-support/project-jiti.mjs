import { createJiti } from "jiti";

const projectRootUrl = new URL("../../", import.meta.url);

export function createProjectJiti(options = {}) {
  return createJiti(projectRootUrl.href, {
    tsconfigPaths: true,
    ...options,
  });
}
