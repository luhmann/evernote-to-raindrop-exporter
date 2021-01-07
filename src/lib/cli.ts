import ora from "ora";
import prompts from "prompts";
import { getAllNotebooksAndStacks } from "./evernote";

type TargetSelection = "names" | "stacks";

export const getImportConfig = async () => {
  const spinner = ora("Loading Evernote Notebooks...").start();
  const { names, stacks } = await getAllNotebooksAndStacks();
  spinner.stop();

  const questions: prompts.PromptObject[] = [
    {
      type: "select",
      name: "target",
      message:
        "Do you want to import Evernote notebooks by names or as stacks of notebooks?",
      choices: [
        {
          title: "Notebook Names",
          description:
            "We will load all your notebooks and you can select the ones you want to import",
          value: "names",
        },
        {
          title: "Stacks",
          description:
            "Stacks are collections of notebooks. If never heard the term, this is probably not what you want.",
          value: "stacks",
        },
      ],
    },
    {
      type: (prev: TargetSelection) =>
        prev === "stacks"
          ? stacks.length > 8
            ? "autocompleteMultiselect"
            : "multiselect"
          : null,
      name: "selectedStacks",
      message: "Please choose the Stacks you want to import.",
      choices: stacks.sort().map((stack) => ({ title: stack, value: stack })),
      min: 1,
    },
    {
      type: (prev: TargetSelection) =>
        prev === "names"
          ? names.length > 8
            ? "autocompleteMultiselect"
            : "multiselect"
          : null,
      name: "selectedNames",
      message: "Please choose the Notebooks you want to import.",
      choices: names.sort().map((name) => ({ title: name, value: name })),
      min: 1,
    },
    {
      type: "confirm",
      name: "confirm",
      message: (prev) =>
        `This will attempt to import "${prev.join(
          ", "
        )}". Did you backup your data here "https://app.raindrop.io/settings/backups"?`,
    },
  ];

  const selection = await prompts(questions);

  if (
    selection?.confirm !== true ||
    (!selection.selectedStacks && !selection.selectedNames)
  ) {
    process.exit(0);
  }

  return selection;
};

export const confirmImport = async () =>
  await prompts([
    {
      type: "confirm",
      name: "confirmStart",
      message: "Should the import be started",
    },
  ]);
