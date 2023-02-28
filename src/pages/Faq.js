import React from 'react';
import { useState } from "react";
import './faq.css';

const questions = [
  {
    id: 1,
    question: "What is itchson.com?",
    answer: "Itchson.com as a web platform to showcase and share the development process of my NFT games created in Unity, as well as other development projects. The site offers a place for you to view and engage with my work and stay up-to-date with the latest projects and updates. Whether you're a game enthusiast or simply interested in software development, itchson.com is a great place to discover and explore exciting new creations in the world of gaming and development.",
  },
  {
    id: 2,
    question: "Who is Itchson?",
    answer: "I am Itchson, a 36-year-old Australian military veteran and solo game developer from Brisbane, Australia. My passion for game development is reflected in the various projects I have undertaken. I am proficient in many programming languages such as C, C++, C#, Javascript, Typescript, node.js, python and more, and I am also skilled in other applications such as blender, procreate, adovbe creative suite, unity and more. In my free time, I enjoy collecting trading cards and reading comics. I created this website to showcase my work and development process, providing insights into my creative journey and the development of my games. I hope you enjoy exploring my website!",
  },
  {
    id: 3,
    question: "Will there be any opportunities to playtest or participate in Itchson's game development projects?",
    answer: "Absolutely! I believe playtesting is a critical part of the game development process, so I'll be sure to share builds of my projects on the website when they are ready. As a solo developer, I appreciate the feedback and support of my community, and I'm always looking for ways to improve my games and make them more enjoyable for players. Keep an eye out for announcements about playtesting opportunities on the website and my social media channels!",
  },
  {
    id: 4,
    question: "How can I support Itchson's game development projects?",
    answer: "Thanks for your interest in supporting my game development projects! The best way to show your support right now would be to follow and like my social media platforms. By doing so, you can keep up-to-date with my latest projects and help spread the word to other game enthusiasts. I appreciate all the support I can get, and I look forward to bringing you more exciting games in the future.",
  },
  {
    id: 6,
    question: "How do I contact Itchson?",
    answer: "You should be able to reach out to me via my social media.",
  },
];

const Faq = () => {
  const [activeQuestion, setActiveQuestion] = useState(null);

  const toggleQuestion = (id) => {
    if (activeQuestion === id) {
      setActiveQuestion(null);
    } else {
      setActiveQuestion(id);
    }
  };

  return (
    <div className="faq-container">
      <div className="faq">
        {questions.map((q) => (
          <div
            key={q.id}
            className={`faq__question ${q.id === activeQuestion ? "faq__question--active" : ""}`}
            onClick={() => toggleQuestion(q.id)}
          >
            <h4>{q.question}</h4>
            {q.id === activeQuestion && <p>{q.answer}</p>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Faq;
