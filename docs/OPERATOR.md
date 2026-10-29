# Cubers operator and public contacts

The owner supplied these details on 2026-10-24. They are connected to all six public legal/support API documents and the app's legal screen, including before login or registration.

| Community                                | Operator displayed                     | Postal address                                                                                           | Website                |
| ---------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| Mainland China, both interface languages | 北京聚缘琴科技有限公司                 | 北京市海淀区上地十街1号院5号楼17层1704室，邮政编码100000                                                 | https://juyuanqin.com  |
| International, English                   | Beijing Juyuanqin Technology Co., Ltd. | 1704, Floor 17, Building 5, No.1 Courtyard, Shangdi 10th Street, Haidian District, Beijing 100000, China | https://exabyte.org.cn |
| International, Simplified Chinese        | 北京聚缘琴科技有限公司                 | 北京市海淀区上地十街1号院5号楼17层1704室，邮政编码100000                                                 | https://exabyte.org.cn |

Support and privacy contact: **support@exabyte.org.cn**. The legal screen offers an email action and the operator website for the current community. The user initiates these links; adding this information does not send mail or create an external support account.

The shared public contract and owner-supplied details are in `packages/core/src/public-operator.ts`. The API selects the installation's configured region, rather than accepting an operator/website choice from a request. Every document also includes the operator, address, email and website in its bilingual text. The screen discards old legal requests when the document or community changes so a late response cannot replace the current community's links.

These facts identify the operator; they do not establish business-registry verification, staffed inbox acceptance, completed legal review, mainland filing/licence identifiers, processor contracts or regulatory approval. No filing number has been invented. Applicable release flags remain off. Actual launch territories, Android distribution channels, commissioned support/moderation processes and final hosted Cubers privacy/deletion URLs still need confirmation. The corporate homepages are not presented as already deployed Cubers API or account-deletion endpoints. The legal pages remain development drafts pending operating and regional review.

Verification covers all six anonymous legal responses in both regional backends, schema parsing, the Chinese operator/address on the mainland installation, the English international details and the correct region-bound browser deletion link. Web/iOS/Android JavaScript exports pass. No visual, accessibility, physical-device or legal acceptance is inferred from those checks.
