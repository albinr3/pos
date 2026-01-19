"use client"

import { useState, useTransition } from "react"
import { Mail, Phone, MapPin, Clock, Send, CheckCircle2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"

export default function ContactPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [isSubmitting, startSubmit] = useTransition()
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validación básica
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast({
        title: "Campos requeridos",
        description: "Por favor completa todos los campos obligatorios",
        variant: "destructive",
      })
      return
    }

    // Validación de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      toast({
        title: "Email inválido",
        description: "Por favor ingresa un email válido",
        variant: "destructive",
      })
      return
    }

    startSubmit(async () => {
      try {
        // Aquí puedes agregar la lógica para enviar el formulario
        // Por ejemplo, una llamada a una API
        await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulación
        
        toast({
          title: "¡Mensaje enviado!",
          description: "Gracias por contactarnos. Te responderemos pronto.",
        })
        
        setIsSubmitted(true)
        setName("")
        setEmail("")
        setPhone("")
        setSubject("")
        setMessage("")
        
        setTimeout(() => setIsSubmitted(false), 3000)
      } catch (error) {
        toast({
          title: "Error",
          description: "No se pudo enviar el mensaje. Por favor intenta nuevamente.",
          variant: "destructive",
        })
      }
    })
  }

  return (
    <div className="py-16 sm:py-24">
      <div className="container max-w-7xl">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl mb-4">
            Contáctanos
          </h1>
          <p className="text-lg leading-8 text-muted-foreground">
            ¿Tienes preguntas, sugerencias o necesitas ayuda? Estamos aquí para ti.
            Envíanos un mensaje y te responderemos lo antes posible.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Formulario */}
          <div className="order-2 lg:order-1">
            <div className="bg-card rounded-2xl border shadow-lg p-6 sm:p-8">
              <h2 className="text-2xl font-semibold mb-6">Envíanos un mensaje</h2>
              
              {isSubmitted && (
                <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-green-800 dark:text-green-200">
                    ¡Mensaje enviado exitosamente!
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Nombre <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Tu nombre"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="829-000-0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="subject">Asunto</Label>
                    <Input
                      id="subject"
                      type="text"
                      placeholder="¿Sobre qué quieres hablar?"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">
                    Mensaje <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="message"
                    placeholder="Escribe tu mensaje aquí..."
                    rows={6}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar mensaje
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>

          {/* Información de contacto */}
          <div className="order-1 lg:order-2">
            <div className="space-y-6">
              {/* Tarjeta de información */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 rounded-2xl border p-6 sm:p-8">
                <h2 className="text-2xl font-semibold mb-6">Información de contacto</h2>
                
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Mail className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Email</h3>
                      <a
                        href="mailto:soporte@tejadapos.com"
                        className="text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                      >
                        soporte@tejadapos.com
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Phone className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Teléfono</h3>
                      <a
                        href="tel:8294751454"
                        className="text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                      >
                        829-475-1454
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <MapPin className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Dirección</h3>
                      <p className="text-muted-foreground">
                        Carretera la Rosa, Moca<br />
                        República Dominicana
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Horario de atención</h3>
                      <p className="text-muted-foreground">
                        Lunes - Viernes: 9:00 AM - 6:00 PM<br />
                        Sábados: 9:00 AM - 1:00 PM
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tarjeta adicional */}
              <div className="bg-card rounded-2xl border p-6 sm:p-8">
                <h3 className="font-semibold text-lg mb-3">¿Necesitas ayuda inmediata?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Si tienes una pregunta urgente o necesitas soporte técnico, no dudes en llamarnos
                  o enviarnos un email. Nuestro equipo está listo para ayudarte.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button asChild variant="outline" className="flex-1">
                    <a href="mailto:soporte@tejadapos.com">
                      <Mail className="h-4 w-4 mr-2" />
                      Enviar email
                    </a>
                  </Button>
                  <Button asChild variant="outline" className="flex-1">
                    <a href="tel:8294751454">
                      <Phone className="h-4 w-4 mr-2" />
                      Llamar ahora
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
