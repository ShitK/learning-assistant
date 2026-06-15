import type { ReactElement } from "react";
import { MathText } from "@/components/math-text";
import {
  createStandardSolutionDisplayText,
  type StandardSolutionBlock,
} from "@/lib/diagnosis/diagnosis-view-model";

type OrderedStandardSolutionBlock = Extract<
  StandardSolutionBlock,
  { kind: "ordered" }
>;
type BulletStandardSolutionBlock = Extract<
  StandardSolutionBlock,
  { kind: "bullet" }
>;

export function StandardSolutionContent({
  blocks,
}: {
  blocks: StandardSolutionBlock[];
}): ReactElement {
  const elements: ReactElement[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (block.kind === "ordered") {
      const orderedBlocks: OrderedStandardSolutionBlock[] = [block];
      let nextIndex = index + 1;

      while (true) {
        const nextBlock = blocks[nextIndex];

        if (!isOrderedStandardSolutionBlock(nextBlock)) {
          break;
        }

        orderedBlocks.push(nextBlock);
        nextIndex += 1;
      }

      elements.push(
        <ol
          key={`ordered-${index}`}
          className="grid list-none gap-2"
          start={getNumericStandardSolutionMarker(block.marker)}
        >
          {orderedBlocks.map((orderedBlock) => (
            <li
              key={`${orderedBlock.marker}-${orderedBlock.text}`}
              className="standard-solution-line grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-4 text-[var(--charcoal)]"
              value={getNumericStandardSolutionMarker(orderedBlock.marker)}
            >
              <span className="mt-0.5 flex h-7 min-w-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-white px-2 text-xs font-semibold text-[var(--mocha)]">
                {orderedBlock.marker}
              </span>
              <span className="min-w-0">
                <MathText
                  text={createStandardSolutionDisplayText(orderedBlock.text)}
                />
              </span>
            </li>
          ))}
        </ol>,
      );

      index = nextIndex - 1;
      continue;
    }

    if (block.kind === "bullet") {
      const bulletBlocks: BulletStandardSolutionBlock[] = [block];
      let nextIndex = index + 1;

      while (true) {
        const nextBlock = blocks[nextIndex];

        if (!isBulletStandardSolutionBlock(nextBlock)) {
          break;
        }

        bulletBlocks.push(nextBlock);
        nextIndex += 1;
      }

      elements.push(
        <ul key={`bullet-${index}`} className="grid list-none gap-2">
          {bulletBlocks.map((bulletBlock, bulletIndex) => (
            <li
              key={`${bulletIndex}-${bulletBlock.text}`}
              className="standard-solution-line grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-4 text-[var(--charcoal)]"
            >
              <span
                className="mt-3 mx-3 h-1.5 w-1.5 rounded-full bg-[var(--mocha)]"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <MathText
                  text={createStandardSolutionDisplayText(bulletBlock.text)}
                />
              </span>
            </li>
          ))}
        </ul>,
      );

      index = nextIndex - 1;
      continue;
    }

    elements.push(
      <p
        key={`paragraph-${index}-${block.text}`}
        className="standard-solution-line text-[var(--charcoal)]"
      >
        <MathText text={createStandardSolutionDisplayText(block.text)} />
      </p>,
    );
  }

  return <div className="standard-solution-body mt-3 grid gap-3">{elements}</div>;
}

function isOrderedStandardSolutionBlock(
  block: StandardSolutionBlock | undefined,
): block is OrderedStandardSolutionBlock {
  return block?.kind === "ordered";
}

function isBulletStandardSolutionBlock(
  block: StandardSolutionBlock | undefined,
): block is BulletStandardSolutionBlock {
  return block?.kind === "bullet";
}

function getNumericStandardSolutionMarker(marker: string): number | undefined {
  return /^\d+$/.test(marker) ? Number(marker) : undefined;
}
