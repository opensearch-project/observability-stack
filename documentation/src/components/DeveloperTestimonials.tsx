import { useState } from 'react';

interface Testimonial {
  id: number;
  quote: string;
  category: string;
  author: string;
  role: string;
  company: string;
  image?: string;
  companyLogo?: string;
  highlight: string;
}

interface DeveloperTestimonialsProps {
  testimonials: Testimonial[];
}

const categories = ['All', 'Speed Wins', 'OTEL Love', 'Local Development', 'Standards-First', 'Framework Support'];

export default function DeveloperTestimonials({ testimonials }: DeveloperTestimonialsProps) {
  const [activeFilter, setActiveFilter] = useState<string>('All');

  const filteredTestimonials = activeFilter === 'All' 
    ? testimonials 
    : testimonials.filter(t => t.category === activeFilter);

  return (
    <div className="w-full">
      {/* Filter Buttons */}
      <div className="flex flex-wrap justify-center gap-3 mb-12">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveFilter(category)}
            aria-pressed={activeFilter === category}
            className={`
              filter-transition px-6 py-2.5 rounded-full font-medium
              ${activeFilter === category
                ? 'bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/30'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:text-white border border-slate-700'
              }
            `}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Testimonials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredTestimonials.map((testimonial) => (
          <div
            key={testimonial.id}
            className="testimonial-card testimonial-fade-in group relative flex flex-col p-8 rounded-xl bg-slate-900/50 border border-slate-800 card-transition hover:border-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/10"
            data-testimonial-id={testimonial.id}
            data-testimonial-category={testimonial.category}
          >
            {/* Large Quote Mark Decoration */}
            <svg 
              className="absolute top-6 right-6 w-16 h-16 text-cyan-500/20 pointer-events-none" 
              fill="currentColor" 
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
            </svg>

            {/* Category Tag */}
            <div className="mb-4">
              <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {testimonial.category}
              </span>
            </div>

            {/* Quote */}
            <div className="flex-grow mb-6 relative z-10">
              <p className="testimonial-quote text-slate-300 leading-relaxed text-base">
                "{testimonial.quote}"
              </p>
            </div>

            {/* Highlight Box */}
            <div className="testimonial-highlight mb-6 p-4 rounded-lg bg-cyan-500/10 border-l-4 border-cyan-500">
              <p className="text-sm font-semibold text-cyan-300">
                ⚡ {testimonial.highlight}
              </p>
            </div>

            {/* Author Info */}
            <div className="flex items-center gap-4">
              {testimonial.image && (
                <img
                  src={testimonial.image}
                  alt={testimonial.author}
                  className="testimonial-avatar w-12 h-12 rounded-full object-cover border-2 border-slate-700"
                  loading="lazy"
                  width="48"
                  height="48"
                  decoding="async"
                />
              )}
              <div className="flex-grow">
                <p className="testimonial-author font-semibold text-white">
                  {testimonial.author}
                </p>
                <p className="testimonial-role text-sm text-slate-400">
                  {testimonial.role}
                </p>
                <p className="testimonial-company text-sm text-slate-500">
                  {testimonial.company}
                </p>
              </div>
              {testimonial.companyLogo && (
                <img
                  src={testimonial.companyLogo}
                  alt={`${testimonial.company} logo`}
                  className="testimonial-company-logo h-8 w-auto object-contain opacity-60"
                  loading="lazy"
                  decoding="async"
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* No Results Message */}
      {filteredTestimonials.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-400 text-lg">No testimonials found for this category.</p>
        </div>
      )}
    </div>
  );
}
