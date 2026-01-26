"use client"

import { faqItems, type FAQItem } from "./faq-data"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export function FAQSection({ items = faqItems }: { items?: FAQItem[] }) {
  return (
    <section className="py-12 sm:py-16 bg-gray-50">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center mb-8">
          <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Preguntas frecuentes
          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            Encuentra respuestas a las preguntas más comunes sobre MOVOPos
          </p>
        </div>

        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
            {/* Columna izquierda */}
            <div>
              <Accordion type="single" collapsible className="w-full">
                {items.slice(0, Math.ceil(items.length / 2)).map((faq, index) => (
                  <AccordionItem key={index} value={`item-left-${index}`}>
                    <AccordionTrigger className="text-left text-base font-semibold">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-base text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            {/* Columna derecha */}
            <div>
              <Accordion type="single" collapsible className="w-full">
                {items.slice(Math.ceil(items.length / 2)).map((faq, index) => (
                  <AccordionItem key={index} value={`item-right-${index}`}>
                    <AccordionTrigger className="text-left text-base font-semibold">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-base text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
