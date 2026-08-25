# TideLog Pro User Agreement (Draft)

> **Status: Draft; not yet in effect.** This document was drafted by AI and **must be reviewed by a legal professional before launch**.
> Drafting date: August 22, 2026

**Effective Date**: To be determined
**Scope of Application**: The Pro subscription service and built-in AI services of the TideLog plugin

---

## 1. Parties to the Agreement and Acceptance

This Agreement is entered into between you and the developer of TideLog (hereinafter referred to as “we”) regarding your use of the TideLog Pro subscription service.

By activating a License, starting a free trial, or using any built-in AI feature, you are deemed to have read, understood, and agreed to this Agreement.
If you do not agree, please do not use the foregoing features—TideLog's local features (planning and review) are not subject to this Agreement.

## 2. Services

### 2.1 Local Features (Free; Not Dependent on This Agreement)
Features that operate solely within your local Obsidian vault, including plan management, review records, and the calendar closed-loop view.

### 2.2 Built-in AI Services (Core of This Agreement)
We provide you with AI generation capabilities through a third-party large language model service provider (currently DeepSeek), including plan suggestions,
daily insights, weekly reports, monthly reports, profile analysis, and other features. **You do not need to apply for or configure an API Key yourself.**

### 2.3 Quota
The AI usage quota for each tier is subject to the information displayed in the plugin and the official documentation. The current quota is as follows:

| Tier | Daily Insights | Weekly Reports / Monthly Reports / Profiles | AI Chat |
|---|---|---|---|
| Free | 3 times per month | Not available | Not available |
| Trial (7 days) | Unlimited | Unlimited | 20 times per day |
| Pro | Unlimited | Unlimited | 200 times per month |

We reserve the right to adjust the quota with prior notice. **The quota for a purchased license that remains within its validity period will not be reduced.**

## 3. Subscription and Payment

### 3.1 Billing Method
Pro uses a **time-based license**: you purchase the right to use the service for a fixed period (one-month license / one-year license).

### 3.2 No Automatic Renewal
**This service does not auto-renew, and there are no automatic charges of any kind.** Upon expiration, the service will automatically be downgraded to the Free tier,
and no charges will be made to any of your accounts. We will notify you before expiration through an in-plugin notice.

### 3.3 Device Limit
Each License may be activated on up to **3 devices**. You may unbind devices yourself through the License Portal.

### 3.4 Refunds
- You may request a full refund **within 7 days** from the date of purchase, provided that the **cumulative number of AI calls does not exceed 10**.
- Outside the foregoing scope, refunds will generally not be issued because the service has already incurred third-party computing costs.
- If the service remains unavailable for an extended period due to reasons attributable to us, a refund will be issued in proportion to the unused period.
- Refunds will be processed through the original purchase channel.

## 4. Your Obligations

When using the built-in AI services, you **must not**:

1. Input or induce the generation of content that violates the laws and regulations of the People's Republic of China, including but not limited to content that endangers national security,
   is obscene or pornographic, involves violence or terrorism, involves gambling or fraud, or infringes upon the lawful rights and interests of others
2. Use technical means to circumvent, crack, or falsify quota limits, License verification, or device binding
3. Resell, rent, or share a License with others, or use it to provide services to third parties
4. Make automated bulk calls to the service, conduct stress testing, or engage in any conduct that may affect service stability
5. Reverse engineer or decompile our server-side interfaces

If you violate any of the foregoing provisions, we have the right to **suspend or terminate** your service without a refund.

## 5. Data and Privacy

### 5.1 Basic Principle
**Your daily records remain in your own Obsidian vault by default.**

### 5.2 What Is Sent When You Use AI Features
When you actively trigger an AI feature, the plugin will send **the note content necessary for that specific generation** to our server,
which we will then forward to the large language model service provider for processing, and the result will be returned to you.

### 5.3 What We Do Not Do
- We **do not store** your note content. It is discarded immediately after the request has been processed and is neither entered into a database nor retained in any records.
- We **do not include** client-side telemetry, analytics SDKs, or behavior tracking.
- We **do not use** your content for model training.

### 5.4 What We Record
We record only the information necessary for service operation: License Key, device identifier, time of invocation, feature type, and token count.
**This does not include the body text of your notes.** This information is used for quota calculation, abuse prevention, and troubleshooting.

### 5.5 Content Compliance Check
Pursuant to the requirements of the large language model service provider, we are required to perform necessary content compliance checks on content sent to the model.
**Such checks are performed only at the moment the request is forwarded; the content is not stored, retained in any records, or used for any other purpose.**

### 5.6 Third-Party Service Provider
The large language model service provider's processing of your content is governed by its own terms of service and privacy policy.
For complete information about data practices, see [PRIVACY.md](./PRIVACY.md).

## 6. Service Availability and Limitation of Liability

### 6.1 We Do Our Best but Do Not Guarantee Uninterrupted Service
AI services depend on third-party large language model service providers and the network environment, and may be interrupted due to maintenance, failures, policy changes, or force majeure.

### 6.2 Offline Grace Period
If License verification fails, the plugin maintains a **7-day offline grace period**, during which Pro features remain available.

### 6.3 Nature of AI-Generated Content
AI output is **for reference only** and may contain errors, omissions, or inaccuracies.
**TideLog does not provide professional advice in areas such as medicine, mental health, law, or finance.** Do not use AI output as the basis for professional decisions.
You are solely responsible for actions taken based on AI suggestions.

### 6.4 Liability Cap
To the maximum extent permitted by law, our aggregate liability in connection with this service
**will not exceed the amount you actually paid during the 12 months preceding the occurrence of the dispute**.

## 7. Amendment and Termination of the Agreement

### 7.1 Amendments
We may revise this Agreement. Material changes will be communicated in advance through an in-plugin notice or release notes.
**Changes will not apply to a purchased license that remains within its validity period**—unless the changes are more favorable to you.

### 7.2 Termination
- You may stop using the service at any time. Ceasing use does not entitle you to a refund (except in the circumstances set forth in Section 3.4).
- If you seriously violate Section 4, we may immediately terminate the service without a refund.

## 8. Dispute Resolution

This Agreement is governed by the laws of the People's Republic of China. The parties shall resolve disputes through friendly consultation; if consultation fails,
the dispute shall be submitted to the People's Court with jurisdiction at the developer's location.

## 9. Contact Information

- Feedback: [TideLog GitHub Issues](https://github.com/enhen3/Tidelog/issues)
- **Do not paste your License Key, personal note content, or other sensitive information into a public issue**

---

## To-Do (Must Be Completed Before Launch)

- [ ] **Review by a legal professional**
- [ ] Determine the effective date and the legal name of the developer entity
- [ ] Prepare an English translation (Obsidian users are primarily located in English-speaking regions)
- [ ] Cross-check against PRIVACY.md and eliminate any inconsistencies
- [ ] Link to this Agreement in the README (Obsidian policy requires disclosure that payment and an account are required)
- [ ] Confirm that the refund terms do not conflict with the respective platform rules of Afdian and Xiaohongshu Shop

The Chinese version shall prevail; this English version is provided for reference only.
