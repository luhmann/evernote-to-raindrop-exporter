import ora from "ora";
import prompts from "prompts";
import { getAllNotebooksAndStacks } from "./evernote";
import { log } from "./logger";

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
          title: "All Notes",
          description:
            "Will look for links in the meta-data of all notes in all notebooks",
          value: "all",
        },
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
        `This will attempt to import "${
          prev === "all" ? "all notes" : prev.join(", ")
        }". Did you backup your data here "https://app.raindrop.io/settings/backups"?`,
    },
  ];

  const selection = await prompts(questions);

  if (
    selection?.confirm !== true ||
    (selection.target !== "all" &&
      !selection.selectedStacks &&
      !selection.selectedNames)
  ) {
    log.error("No valid import-options selected. Aborting.");
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

export const requestToken = async () =>
  await prompts([
    {
      type: "password",
      name: "evernoteToken",
      message:
        "Enter your API-Token for Evernote. Check the README to find out how to generate one.",
      validate: (token: string) => {
        if (!token.includes("en-devtoken")) {
          return "Wrong token format: Token should have a format similar to this 'S=s1:U=8f219:E=154308dc976:C=14cd8dc9cd8:P=1cd:A=en-devtoken:V=2:H=1e4d28c7982faf6222ecf55df3a2e84b'. 'Please refer to 'https://dev.evernote.com/doc/articles/dev_tokens.php' for instructions on how to generate one";
        }

        return true;
      },
    },
    {
      type: "password",
      name: "raindropToken",
      message:
        "Enter your API-Token for raindrop.io. Check the README to find out how to generate one.",
      validate: (token: string) => {
        const uuidv4Regex = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

        if (token.length !== 36 || !token.match(uuidv4Regex)) {
          return "Wrong token format: Token should be a uuidv4, of this format 'xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx'. Refer to the instructions on how to generate a 'test token': 'https://developer.raindrop.io/v1/authentication/token'";
        }

        return true;
      },
    },
  ]);
