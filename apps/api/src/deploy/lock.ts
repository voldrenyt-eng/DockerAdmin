export type DeployLockHandle = {
  release: () => void;
};

export type DeployLockService = {
  acquire: (projectId: string) => DeployLockHandle | null;
};

export const createInMemoryDeployLockService = (): DeployLockService => {
  const activeProjectIds = new Set<string>();

  return {
    acquire(projectId) {
      if (activeProjectIds.has(projectId)) {
        return null;
      }

      activeProjectIds.add(projectId);
      let released = false;

      return {
        release() {
          if (released) {
            return;
          }

          released = true;
          activeProjectIds.delete(projectId);
        },
      };
    },
  };
};
