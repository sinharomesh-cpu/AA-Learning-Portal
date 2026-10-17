# AA Pro: Can each AI voice provider be used in a children's learning app?

Pages accessed 17–18 October 2026. Research only: no sign-ups, no purchases, no contact with providers.

**How to read this report.** Quotes are copied from the provider's official page as the fetch tool returned it. Some quotes are cut short because the tool limits quote length. Those are marked "…", and the rest of the clause is paraphrased. "Unverified" means the page could not be read in full or the point was not stated, so no conclusion is drawn. **This report is not legal advice.** A lawyer needs to review it before AA Pro signs with any provider.

**AA Pro's situation.** Children are about 6–12, so every child user is under 13 and also under 18. Parents create the accounts and give consent. Families are in India and Singapore. All calls go through AA Pro's own server. Each session lasts 15 minutes, with at most one per child per day.

---

## 1. Summary table

| Provider | Can AA Pro use it for children? | Key conditions | Real-time voice built in? | DPA / zero retention / training | Main sources |
|---|---|---|---|---|---|
| **Google Gemini Developer API** (ai.google.dev) | **No** | The terms say you must be 18+, and the service may not be used in an app "directed towards or is likely to be accessed by individuals under the age of 18". There is no exception for education or parental consent. | Yes (Live API) | Paid tier: Google does not train on your data; a DPA applies; prompts are logged for a limited time to monitor abuse. Free tier: Google may use your data and humans may review it. | ai.google.dev/gemini-api/terms |
| **Google Cloud Vertex AI (Gemini)** | **Unverified** | We found no age or child clause in the Google Cloud Terms of Service, the Acceptable Use Policy, the Generative AI Prohibited Use Policy, or the readable part of the Service Specific Terms. The AI/ML section of the Service Specific Terms could not be read beyond §15(a). Google staff on its forum have declined to answer this question. | Yes (Gemini Live API on Vertex) | "Google won't use your data to train or fine-tune any AI/ML models without your prior permission." Zero data retention is possible if you turn off caching, request an abuse-logging exception, and leave session resumption off. | cloud.google.com/terms/*, docs.cloud.google.com/vertex-ai/.../data-governance |
| **OpenAI API (Realtime)** | **Conditional** | Parent or guardian consent is required. You must follow child-protection and privacy laws and add safeguards suited to children's ages. For children under 13 (or under the local age of digital consent), you must turn on zero data retention first. | Yes (`/v1/realtime`, gpt-realtime models) | A DPA exists. OpenAI does not train on API data unless you opt in. Realtime is eligible for zero data retention. India and Singapore offer data **storage** only, not processing. | openai.com/policies/services-agreement, developers.openai.com/.../under-18-api-guidance, .../your-data |
| **Microsoft Azure OpenAI / Azure AI Speech** | **Unverified** (no age bar found) | The Code of Conduct, Product Terms (MCA) and Transparency Note contain no clause about minors' age. A Microsoft employee answering on Microsoft Q&A in 2023 said Azure's own terms apply, not OpenAI's consumer terms, and that you should tell users AI is involved and get consent. | Yes (Azure OpenAI realtime / Voice Live) | Azure does not train on your data. Abuse-monitoring storage can be switched off only if Microsoft approves. Where data is processed depends on the deployment type. Availability in India and Singapore is unverified. | learn.microsoft.com/legal/ai-code-of-conduct, .../data-privacy, Q&A 1290416 |
| **Anthropic Claude API** | **Conditional** | Explicitly allows organisations whose products let minors interact with Claude. You must add safeguards (age checks, content filtering, monitoring), follow COPPA and similar laws and state that publicly, tell users they are talking to an AI, and accept periodic audits by Anthropic. There are no specific rules for under-13s. | **No.** Text only, so you would also need separate speech-to-text and text-to-speech providers, each with its own terms. | A DPA exists. "Anthropic may not train models on Customer Content." Zero data retention is available through Anthropic sales. Data can be kept in the US or "global" regions only. | anthropic.com/legal/aup, support.claude.com/.../9307344, anthropic.com/legal/commercial-terms |
| **ElevenLabs (ElevenAgents)** | **Unverified / likely blocked without written permission** | The Terms of Use say: "If you are under 18 years of age … you may not use our Services". The Agents terms ban agents "directed to children under 13" in the Reception Offering. The text under the Prohibited Use Policy's "Protection of Minors" heading did not load. | Yes | A DPA exists. ElevenLabs **may train on your content unless you opt out.** Zero Retention Mode is for "select enterprise customers" only. Data residency in India and Singapore is Enterprise-only. | elevenlabs.io/terms-of-use, /agents-terms, /use-policy, docs ZRM and data residency |
| **Amazon Bedrock / Nova 2.5 Sonic** | **Unverified** (no age bar found) | The AWS Responsible AI Policy forbids only "harm or abuse of a minor". The Nova 2.5 Sonic Service Card lists "education and language learning" as an intended use. The Bedrock and Nova sections of the AWS Service Terms could not be read. | Yes (speech-to-speech; supports Hindi and Indian English) | AWS does not train on inputs or outputs. The service card says Bedrock "does not store or review customer prompts". An AWS DPA was not checked in this session. A secondary source lists Tokyo as the only Asia region at launch (not Mumbai or Singapore). | aws.amazon.com/ai/responsible-ai/policy, docs.aws.amazon.com/ai/responsible-ai/nova-2-5-sonic |

---

## 2. Provider details

### 2.1 Google Gemini Developer API

**Page:** https://ai.google.dev/gemini-api/terms. It says "Effective March 23, 2026" and "Last updated 2026-04-28 UTC". Accessed 2026-10-17.

**(a) Use by children: No.**

The "Age Requirements" section says:

> "You must be 18 years of age or older to use the APIs."

The same section says you may not use the Services as part of a website, application or other service:

> "…that is directed towards or is likely to be accessed by individuals under the age of 18."

When asked whether there is any exception, the page states none for education, Workspace for Education or written approval. Parental consent is not mentioned as an exception, so it does not lift the restriction.

The terms also say they do not apply to Google Cloud:

> "For clarity, these Terms do not govern your direct use of any Google Cloud Platform service"

**(b) Your data.**

On the paid tier:

> "Google doesn't use your prompts" … "or responses to improve our products."

Prompts on the paid tier are processed under Google's Data Processing Addendum. They are logged for a limited time to detect misuse and meet legal duties.

On the free tier:

> "human reviewers may read, annotate, and process your API input and output."

If you use Grounding with Google Search:

> "Google will store prompts, contextual information that you may provide, and output for thirty (30) days."

**(c) Voice.** The Live API offers real-time voice.

**(d) Regions.**

> "You may only access the Services (or make API Clients available to users) within an available region."

**Forum context (not official policy).** Google's developer forum has several 2026 threads asking about children's apps and under-18 routing (October 5, 12 and 14, 2026). Respondents who appear to be Google staff replied only that "We can't provide specific legal guidance on this forum." Threads: https://discuss.ai.google.dev/t/age-restriction-under-18-is-routing-minors-away-from-gemini-api-acceptable/188423 and https://discuss.ai.google.dev/t/age-requirements-clause-offline-developer-side-generation-of-static-audio-images-for-a-childrens-app/186872

### 2.2 Google Cloud Vertex AI (Gemini on Google Cloud)

**(a) Use by children: Unverified.**

We found no clause about minors, age or child-directed services in these pages:

- **Google Cloud Platform Terms of Service** (https://cloud.google.com/terms). We read the full text. The only acceptable-use wording is general.
- **Google Cloud Acceptable Use Policy** (https://cloud.google.com/terms/aup, "Last modified October 12, 2026"). The only related item is a ban on "illegal activity, including child sexual exploitation, child abuse…".
- **Generative AI Prohibited Use Policy** (https://policies.google.com/terms/generative-ai/use-policy, "Last Modified: December 17, 2024"). The only related item is a ban on content that "Relates to child sexual abuse or exploitation". The policy also says: "We may make exceptions to these policies based on educational, documentary, scientific, or artistic considerations…" That sentence is about content, not user age.
- **Service Specific Terms** (https://cloud.google.com/terms/service-terms). The readable text ends partway through §15(a) "Intellectual Property Terms for AI/ML Services". Any later Generative AI section could not be read, so this point remains **Unverified**. The only education-related wording found is a K-12 exclusion in an unrelated BigQuery clause, §3(c)(ii)(C).

A community reply on Google's forum from 1 May 2025 says the Gemini API age limits "apply regardless of how the API is accessed", including through Vertex AI (https://discuss.google.dev/t/question-regarding-age-restrictions-for-the-gemini-api/188060). The page does not identify the replier as Google staff. This conflicts with the Gemini API terms saying they do "not govern your direct use of any Google Cloud Platform service". Neither source is authoritative for Vertex AI. **Get written confirmation from Google Cloud before relying on Vertex AI.**

**(b) Your data.** From https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance:

> "Google won't use your data to train or fine-tune any AI/ML models without your prior permission or instruction."

To reach zero data retention you need to:

- turn off the default 24-hour in-memory caching
- request an exception to abuse-monitoring logging
- leave Live API session resumption switched off (it is off by default)
- avoid grounding with Google Search or Maps

We did not open the Google Cloud Data Processing Addendum in this session.

**(c) Voice.** Real-time voice is available through the Gemini Live API on Vertex, which is described as "low-latency, real-time voice and video interactions with Gemini".

**(d) Regions.** Whether the Live API is available in Mumbai (asia-south1) or Singapore (asia-southeast1) is **Unverified**. The page content we received did not list regions.

**Workspace for Education (related, but not an API).** A Jisc article from 8 September 2026 quotes Google Help as saying Gemini Apps are available "to users of all ages" in Workspace for Education editions. That covers Google's own app for schools, not a developer API, so it does not make Vertex AI permissible for AA Pro.

### 2.3 OpenAI API (Realtime)

**(a) Use by children: Conditional.**

The Services Agreement (https://openai.com/policies/services-agreement/, "Effective: January 1, 2026") says in §3.3(c) that the customer must not:

> "allow minors to use OpenAI Services without consent from their parent or guardian;"

The Under-18 API guidance (https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance, no date shown) says:

> "Young people have unique needs online and offline, so developers should implement additional safeguards" (when serving users under 18).

> "Organizations serving minors must comply with all applicable child protection, safety, and privacy laws" (the page gives COPPA as an example).

> "reasonable steps to ensure that the content they are serving to minors via the API is safe and age appropriate."

It suggests these measures:

- "Providing age-appropriate disclosures to minors about AI tools and how to use them responsibly."
- "Implementing age-appropriate content filters…"
- "Implementing reasonable monitoring and reporting mechanisms, including escalation paths for high-risk interactions."
- "using age assurance systems to ensure only intended users can access the product."

On children under 13:

> "You should not use OpenAI services to process any personal data of children under 13" … unless zero data retention has first been implemented in the API. The same applies to the local age of digital consent.

On enforcement: customers who cannot show they comply "may be subject to suspension or termination of API access".

OpenAI's consumer Terms of Use (13+, parental permission under 18) cover ChatGPT. They do not cover the API, which falls under the business terms.

The Usage Policies (https://openai.com/policies/usage-policies/, effective October 29, 2025) say "Children and teens deserve special protection." They also ban specific harms to minors, such as "exposing minors to age-inappropriate content".

**(b) Your data.**

- Services Agreement §4.2: "OpenAI will not use Customer Content to develop or improve the Services, unless Customer explicitly agrees to such use."
- Services Agreement §5.3: "OpenAI and Customer will comply with the DPA…"
- From https://developers.openai.com/api/docs/guides/your-data: abuse-monitoring logs are kept "for up to 30 days" by default. The endpoint `/v1/realtime` is marked eligible for zero data retention.
- How to get zero data retention approved is not stated on the parts of the page we read. **Unverified; confirm with OpenAI.**

**(c) Voice.** Native real-time speech-to-speech through `/v1/realtime` with the `gpt-realtime`, `gpt-realtime-1.5` and `gpt-realtime-mini` models.

**(d) Regions.** India (`in.api.openai.com`) and Singapore (`sg.api.openai.com`) are listed as "storage only, requires MAM or ZDR". Processing in those countries is not offered. Whether Realtime is covered in India or Singapore is **Unverified** because the page's list was truncated.

### 2.4 Microsoft Azure OpenAI / Azure AI Speech

**(a) Use by children: Unverified. No age bar was found in the pages we checked.**

- **Code of Conduct for Foundry Tools** (https://learn.microsoft.com/en-us/legal/ai-code-of-conduct, last updated 2026-05-01). No clause on age or minors' use. It bans child sexual exploitation and grooming content, and use "To exploit any of the vulnerabilities of a person due to their age…". Requirement 8 says you must "Provide all necessary notices and obtain all necessary consents as required by applicable law…".
- **Microsoft Product Terms for Azure (MCA)** (https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/MCA). We read the full text and found no wording about minors or age.
- **Transparency Note** (last updated 2026-09-21). No guidance on minors. It lists "educational assessments" as a common use.
- **Microsoft Q&A, 2023** (https://learn.microsoft.com/en-us/answers/questions/1290416/). A Microsoft employee answered a question about a solution for high-school students: "your use of the Azure services is governed by the terms and conditions as defined on this page… So, Azure OpenAI also has the same terms since it is offered under an Azure subscription." He added: "while enabling the usage of the service by students it is important you disclose the use of AI in your application and request consent…" This is a forum answer, not a contract term. No minimum age is stated.

**(b) Your data.** From https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy (updated 2026-05-19):

> "prompts and completions are not used to train, retrain, or improve the base models."

On abuse monitoring, if the customer has been approved for modified abuse monitoring:

> "…the data storage and human review process described above is not performed."

Approval comes through Microsoft's Limited Access process. We did not check the Microsoft Products and Services DPA in this session.

**(c) Voice.** Native real-time voice through Azure OpenAI realtime models and the Voice Live API. Microsoft notes that with Voice Live, "Processing can occur outside your resource region."

**(d) Regions.** Central India and Southeast Asia are listed for core Speech services. Voice Live and realtime availability there is **Unverified**. Under Global or DataZone deployments, prompts "may be processed in any geography where the relevant model… is deployed."

### 2.5 Anthropic Claude API

**(a) Use by children: Conditional, and explicitly allowed.**

The Usage Policy (https://www.anthropic.com/legal/aup) showed "Effective November 12, 2026", which is a future date. The live page appears to show the upcoming version, so check which version is in force when you sign. It says:

> "We define a minor or child to be any individual under the age of 18 years old, regardless of jurisdiction."

> "Products serving minors, including organizations providing minors with the ability to directly interact…" … "must comply with the additional guidelines outlined in our Support article and all applicable laws."

The support article "Guidelines for Organizations Serving Minors" (https://support.claude.com/en/articles/9307344, updated March 16, 2026) requires the following:

- **Safety measures**, such as:
  - "Age verification systems to ensure only intended users can access the product"
  - "Content moderation and filtering to block inappropriate or harmful content"
  - "Monitoring and reporting mechanisms…"
  - "Educational resources and guidance for minors…"
- **A child-safety system prompt.** Anthropic may provide one, which organisations serving minors "should implement".
- **Legal compliance.** "It is the responsibility of organizations to comply with all applicable child safety and data privacy regulations." This must be "clearly stated on the organization's website or similar public-facing documentation."
- **AI disclosure.** "Organizations must disclose to their users that they are interacting with an AI system rather than a human."
- **Audits.** "Anthropic will periodically audit organizations for compliance…" Non-compliance "may lead to the suspension or termination of your account."

The article has no specific rules for under-13s and does not require Anthropic's prior approval. Separately, Claude's own consumer apps are limited to users aged 18 and over (as quoted in the Jisc article). That rule is for Anthropic's apps, not the API.

**(b) Your data.**

- Commercial Terms (https://www.anthropic.com/legal/commercial-terms, effective June 17, 2025): "Anthropic may not train models on Customer Content from Services."
- The same terms say data is processed under "the Anthropic Data Processing Addendum".
- Zero data retention: "To request ZDR for your organization, contact the Anthropic sales team." (https://platform.claude.com/docs/en/build-with-claude/zero-data-retention)

**(c) Voice.** No speech-to-speech. AA Pro would need a separate speech-to-text and text-to-speech provider, and those providers' terms on children would also need checking. This pipeline would also likely respond more slowly than native voice.

**(d) Regions.** The data residency page says "Only `"us"` and `"global"` are available." India and Singapore are not offered.

### 2.6 ElevenLabs (ElevenAgents / Conversational AI)

**(a) Use by children: Unverified, and likely blocked without written permission.**

The Terms of Use (https://elevenlabs.io/terms-of-use, last updated 09 October 2026), §1(a):

> "If you are under 18 years of age (or the age of legal majority where you live), you may not use our Services"

The terms do not say whether this applies to the children who use a customer's app, or only to the account holder.

The Agents terms (https://elevenlabs.io/agents-terms, last updated October 09, 2026), Exhibit 1 §3.2:

> "You shall not deploy a Customer AI Agent in the Reception Offering that is directed to children under 13."

The "Reception Offering" is a specific small-business configuration for handling inbound calls. The main Agents terms set no age rule for "Agent Users". However, they say Agent Users "are deemed End Users for purposes of the suspension and indemnification provisions". They also require you to:

- disclose that users are "interacting with AI rather than a human"
- disclose that ElevenLabs processes the conversation
- disclose that "the interaction is recorded", where recording is enabled
- obtain any consents the law requires and keep evidence of them for five years

The Prohibited Use Policy (https://elevenlabs.io/use-policy) has a heading "1. Protection of Minors", but the text under it did not load. **Unverified.**

**(b) Your data.**

- A Data Processing Addendum exists (Terms §2).
- **Training:** ElevenLabs may use your Content "to improve the Services, and to develop new services and products"; "you may opt out of our use of your Content for training at any time."
- **Zero Retention Mode:** "available to select enterprise customers" (https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode). For ElevenAgents it is enabled per agent and covers API traffic only.
- **Behind-the-scenes model:** The language model behind an ElevenLabs agent can be Gemini, Claude or OpenAI. If AA Pro used ElevenLabs with Gemini underneath, Google's terms could still be an issue. Confirm this with ElevenLabs.

**(c) Voice.** Native real-time voice agents.

**(d) Regions.** India and Singapore data residency are available, but only on Enterprise plans (https://elevenlabs.io/docs/overview/administration/data-residency).

### 2.7 Amazon Bedrock / Amazon Nova 2.5 Sonic

**(a) Use by children: Unverified. No age bar was found in the pages we checked.**

The AWS Responsible AI Policy (https://aws.amazon.com/ai/responsible-ai/policy/, dated January 13, 2025) only forbids using the services:

> "for harm or abuse of a minor, including grooming and child sexual exploitation;"

The Nova 2.5 Sonic Service Card (https://docs.aws.amazon.com/ai/responsible-ai/nova-2-5-sonic/overview.html, current as of October 5, 2026) lists education as an intended use:

> "Customers can use Amazon Nova 2.5 Sonic for tasks such as customer service call automation, education and language learning…"

It also says Amazon tests mitigations "to prevent Amazon Nova 2.5 Sonic from generating inappropriate content related to children."

The AWS Service Terms (https://aws.amazon.com/service-terms/, "Last Updated: October 13, 2026") could only be read up to §38. The Bedrock, Nova and AI Services sections were not reached, so this is **Unverified**.

A secondary site (ConductAtlas) quotes an AWS clause for Amazon Lex beginning "If you use Amazon Lex in connection with websites, programs or other applications that are directed or targeted," and requiring verifiable parental consent. This suggests AWS writes COPPA conditions into its terms for some services. Whether Bedrock has a similar clause is unknown.

**(b) Your data.** From the Service Card:

> "AWS does not use inputs or outputs generated through the Amazon Bedrock service to train Amazon Bedrock models, including Amazon Nova 2.5 Sonic."

> "Amazon Bedrock is a managed service and does not store or review customer prompts or customer speech or text generations…"

The Bedrock abuse-detection page (https://docs.aws.amazon.com/bedrock/latest/userguide/abuse-detection.html) says some third-party models keep traffic for up to 30 days. That retention applies to some OpenAI and Anthropic models on Bedrock, not to Nova Sonic. We did not check the AWS DPA in this session.

**(c) Voice.** Native real-time speech-to-speech. Supported languages include Hindi, and Indian English is one of the voices.

**(d) Regions.** A secondary news source (aiweekly.co) says the model became generally available on October 5, 2026 in four regions: N. Virginia, Oregon, Stockholm and Tokyo. Mumbai and Singapore were not among them. **Unverified on AWS's own page.**

---

## 3. Recommendation (neutral)

1. **Do not use the Gemini Developer API.** Its terms clearly rule out apps likely to be used by under-18s, and they offer no exception for parental consent.
2. **The options that appear eligible on their published terms are:**
   - **OpenAI Realtime API.** It is the only provider found with both native real-time voice and written terms that expressly allow use by minors under stated conditions. The conditions are:
     - verifiable parental consent
     - age-appropriate safeguards and monitoring
     - zero data retention switched on before processing any data from under-13s
   - **Anthropic Claude API.** Its policy expressly allows organisations serving minors, with stated safeguards. However, it has no voice of its own, so AA Pro would also need separate speech-to-text and text-to-speech providers whose terms allow children. Data residency is limited to the US or "global".
3. **Promising but unconfirmed: Azure OpenAI realtime and AWS Nova 2.5 Sonic.** No age restriction was found and both offer native voice. But Microsoft and AWS have not said in writing that child-directed use is allowed, and key AWS terms could not be read.
4. **Vertex AI and ElevenLabs should not be relied on** without a written statement from the provider.

**Written confirmation and legal review still needed, whichever provider is chosen:**

- A written statement from the chosen provider (through sales or legal) that its current terms allow a voice tutor directed at children aged 6–12, with parent-created accounts, on AA Pro's plan and tier.
- Signed DPA and zero data retention approval, plus confirmation that Realtime traffic is covered.
- Legal review against India's DPDP Act and Rules (verifiable parental consent; restrictions on tracking, monitoring and targeted ads for children), Singapore's PDPA and its Advisory Guidelines on children's data, and COPPA if any US users are possible.
- Confirmation of where audio and text are processed and stored for India and Singapore users.
- If a separate speech-to-text or text-to-speech service is used, the same checks on that provider.

---

## 4. Pages that could not be read, or were only partly read

- **Google Cloud Service Specific Terms** (https://cloud.google.com/terms/service-terms). The text ends partway through §15(a) "AI/ML Services", so any Generative AI section, including possible age wording, was not read. Fetching with curl was blocked by the network proxy.
- **Vertex AI Live API overview** (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api). Regions, supported languages and native-audio details were not in the returned content.
- **ElevenLabs Prohibited Use Policy** (https://elevenlabs.io/use-policy). The body of "1. Protection of Minors" did not load.
- **AWS Service Terms** (https://aws.amazon.com/service-terms/). Only §§1–38 were read. The Bedrock, Nova, AI Services and Lex sections were not reached.
- **Azure Speech regions page.** The Voice Live region tab was not included in the returned content.
- **OpenAI "your data" page.** The India and Singapore service lists were truncated, and the process for getting zero data retention approved was not shown.
- **Not checked at all in this session:** Google Cloud DPA, Microsoft Products and Services DPA, and AWS DPA.
