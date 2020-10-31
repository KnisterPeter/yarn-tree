#!/usr/bin/env node

import "source-map-support/register";

import type { PackageJson } from "type-fest";

import yargs from "yargs";
import { parse, LockFileObject, Dependency } from "@yarnpkg/lockfile";
import { promises as fsp } from "fs";
import { join } from "path";

type TreeTuple = [parents: string, dependency: string];

function createTreeTupleList(
  parents: string,
  object: Dependency | PackageJson.Dependency | undefined
): TreeTuple[] {
  return Object.entries(object ?? {}).map(([k, v]) => [parents, `${k}@${v}`]);
}

(async () => {
  const argv = yargs
    .option("package-json", {
      string: true,
      default: ".",
    })
    .usage("Usage: $0")
    .help("help")
    .alias("h", "help")
    .parse();

  const packageJsonDir = argv["package-json"].replace(/[\/]package.json$/, "");
  const packageJson: PackageJson = JSON.parse(
    await fsp.readFile(join(packageJsonDir, "package.json"), "utf-8")
  );

  const yarnLock = await fsp.readFile("yarn.lock", "utf-8");
  const parsedLock = parse(yarnLock);
  const object: LockFileObject = parsedLock.object;

  const list: TreeTuple[] = [];

  const dependencies: TreeTuple[] = createTreeTupleList(
    ".",
    packageJson.dependencies
  );

  while (dependencies.length > 0) {
    const [parents, dependency] = dependencies.shift()!;
    if (parents.includes(dependency)) {
      // break on dependency recursion
    } else {
      list.push([parents, dependency]);

      if (!object[dependency]) {
        console.warn(`Dependency '${dependency}' not in yarn.lock`);
      } else if (object[dependency].dependencies) {
        dependencies.push(
          ...createTreeTupleList(
            `${parents}#${dependency}`,
            object[dependency].dependencies
          )
        );
      }
    }
  }

  const treeList = list.map(([parents, item]) => `${parents}#${item}`).sort();
  const treeItem = (index: number) => {
    const line = treeList[index];
    const lastHash = line.lastIndexOf("#");
    return [line.substring(0, lastHash), line.substring(lastHash + 1)] as [
      parents: string,
      item: string
    ];
  };
  const isLastItem = (index: number): boolean => {
    if (treeList.length - 1 < index + 1) {
      return true;
    }
    const thisItem = treeList[index];
    const [thisParents] = treeItem(index);
    for (let i = index + 1; i < treeList.length; i++) {
      const [nextParents] = treeItem(i);
      if (!nextParents.startsWith(thisItem)) {
        return thisParents !== nextParents;
      }
    }
    return true;
  };
  const hasChildItems = (index: number) => {
    if (treeList.length - 1 < index + 1) {
      return false;
    }
    const thisItem = treeList[index];
    const [nextParents] = treeItem(index + 1);
    return thisItem === nextParents;
  };
  const symbols = {
    item: "├─ ",
    last: "└─ ",
    vertical: "│  ",
    empty: "   ",
  };

  const openColumns: boolean[] = [];
  for (let i = 0; i < treeList.length; i++) {
    const [parents, item] = treeItem(i);
    const hasChildren = hasChildItems(i);
    const isLast = isLastItem(i);
    const parentsIndent = parents.split("#").slice(1);

    openColumns.splice(parentsIndent.length);
    if (hasChildren) {
      openColumns.push(!isLast);
    }

    const indent = parentsIndent
      .map((_, n) => (openColumns[n] ? symbols.vertical : symbols.empty))
      .join("");

    console.log(`${indent}${isLast ? symbols.last : symbols.item}${item}`);
  }
})().catch((e) => {
  setImmediate(() => {
    throw e;
  });
});
