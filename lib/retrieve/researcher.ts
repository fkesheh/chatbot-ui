import { SupabaseClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import {
  ChatCompletionCreateParamsBase,
  ChatCompletionMessageParam
} from "openai/resources/chat/completions.mjs"
import { retriever } from "./retriever"

export const researcher = async (
  supabaseAdmin: SupabaseClient<any, any>,
  openai: OpenAI,
  embeddingsProvider: "openai" | "local",
  input: string,
  sourceCount: number,
  uniqueFileIds: string[],
  model: ChatCompletionCreateParamsBase["model"]
) => {
  let questionAnswered = false
  const research: string[] = []
  let currentAnswer = ""
  while (!questionAnswered) {
    const chunks = await retriever(
      supabaseAdmin,
      openai,
      embeddingsProvider,
      input,
      sourceCount,
      uniqueFileIds
    )

    const answerPrompt = `You are a research assistant tasked with the responsibility of addressing user questions based solely on provided CONTENT and CURRENT ANSWER. Your role includes evaluating any existing answers for completeness, generating answers when none are available, and determining the need for further exploration. Use your critical thinking and research capabilities to ensure each answer is accurate, comprehensive, and tailored to the question.
To achieve the goal, execute the following steps:
1. **Initial Assessment**: Start by understanding the question and reviewing the provided contents. If a previous answer exists, evaluate its relevance and completeness in the context of the contents.
2. **Answer Generation**: If no previous answer exists or if the existing answer is inadequate, generate a new answer based solely on provided CONTENT. Use only the contents as a foundation for your response, ensuring it is informed, comprehensive, and directly addresses the question.
3. **Enhancement and Research**: Whether enhancing an existing answer or generating a new one, incorporate additional insights or research as needed. Your response should be the most accurate and complete answer possible given the contents and your knowledge base.
4. **Further Inquiry Identification**: After providing or enhancing an answer, consider if there are aspects of the question that could benefit from further exploration. Generate a new, specific question if there is a clear avenue for additional inquiry that could provide deeper understanding or value.
5. **Output Preparation**: Format your response to include the enhanced or newly generated answer, an assessment of its completeness, and one suggested new question for further exploration. Structure this output clearly in JSON as follows:
<JSON>
{
  "answer": "<<Your answer here>>",
  "newQuestion": "<<Question that will enrich the gaps in the answer>>",
   "continueResearching": <<true or false>>,
}
</JSON>
Execute all the steps, ensuring to clearly follow each step instruction and stating your reasoning.`

    const messages = [
      { role: "system", content: answerPrompt },
      {
        role: "user",
        content: `<QUESTION>${input}</QUESTION>\n\n<CURRENT ANSWER>${currentAnswer}</CURRENT ANSWER>\n\n# CONTENTS:\n${chunks.map(chunk => chunk.content).join("---------------------------------------------\n\n")}`
      }
    ] as ChatCompletionMessageParam[]

    console.log(JSON.stringify(messages))
    const enrichResponseCall = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0,
      max_tokens: 4096,
      stream: false
    })

    const result = enrichResponseCall.choices[0].message.content
    console.log(result)

    const jsonExtract = result?.match(/\{[^}]*\}/g)

    if (!jsonExtract) {
      throw new Error("No JSON found in the response")
    }

    const json = JSON.parse(jsonExtract[0])

    currentAnswer = json.answer
    research.push(currentAnswer)
    questionAnswered = json.continueResearching

    console.log(JSON.stringify(research))
  }
  return { results: research.map(answer => ({ content: answer })) }
}
